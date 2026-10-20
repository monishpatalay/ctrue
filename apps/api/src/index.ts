import dotenv from 'dotenv';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import OpenAI from 'openai';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { AudioBudget, AudioTurns, DemoStore, Handoffs, HttpError, LANGUAGES, StepScanner, WALK_SCHEMA, docxSize, imageData, openaiKey, prompt, sha256, string, toWalkStep, uuid, walkPrompt, type Session } from './core.js';

// apps/api/.env wins; the repo-root .env.local is where `neon deploy` and `neon env pull` write DATABASE_URL.
dotenv.config({path:['.env','../../.env.local'],quiet:true});
const env=process.env, demo=env.DEMO_MODE==='true', host=env.HOST||'127.0.0.1', port=Number(env.PORT||4318);
if(demo && (env.NODE_ENV==='production' || !['127.0.0.1','::1','localhost'].includes(host))) throw new Error('Demo must run in development on loopback');
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
const authBase=env.NEON_AUTH_BASE_URL?.replace(/\/+$/,'');
const configured={auth:!!(env.DATABASE_URL&&authBase),ai:!!env.OPENAI_API_KEY};
// Production needs sign-in, the database and an OpenAI key for the owner.
if(env.NODE_ENV==='production'&&!(configured.auth&&configured.ai)) throw new Error('Production requires Neon and OpenAI credentials');
const pool=configured.auth?new pg.Pool({connectionString:env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,query_timeout:10000}):null;
pool?.on('error',error=>console.error('Database connection error:',error.message));
// Neon Auth signs browser JWTs with EdDSA; issuer and audience are the Auth URL's origin.
const jwks=authBase?createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`)):null, issuer=authBase?new URL(authBase).origin:'';
// METERING=false makes the app free: sessions track time but never spend or require credits.
const metered=env.METERING!=='false';
const store=new DemoStore(), handoffs=new Handoffs<{id:string;email?:string}>();
async function sql<T extends pg.QueryResultRow=pg.QueryResultRow>(text:string,values:unknown[]):Promise<T[]> {
  if(!pool)throw new HttpError(503,'Database not configured');
  try { return (await pool.query<T>(text,values)).rows; }
  catch(e) {
    // P0001 is a deliberate RAISE from the metering functions; anything else is an outage.
    const {code,message=''}=e as {code?:string;message?:string};
    if(code!=='P0001'){console.error('Database query failed:',message);throw new HttpError(503,'Database unavailable');}
    throw new HttpError(message.includes('Credits')?402:message.includes('not found')?404:message.includes('Another')?409:400,message);
  }
}
const origins=new Set((env.ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173').split(',').map(v=>v.trim()));
// The packaged Electron app sends Origin "null" on fetch and "file://" on WebSocket; bearer authentication still
// applies to every protected operation.
function originAllowed(origin:string|undefined) { return !origin || origin==='null' || origin==='file://' || origins.has(origin); }
const trial=Number(env.TRIAL_SECONDS||600), transcriptionLanguage=env.OPENAI_TRANSCRIPTION_LANGUAGE||'en';
if(!Number.isInteger(trial)||trial<0||trial>36000) throw new Error('Invalid TRIAL_SECONDS');
const vadThreshold=Number(env.AUDIO_VAD_THRESHOLD||0.01),silenceMs=Number(env.AUDIO_SILENCE_MS||600);
if(!Number.isFinite(vadThreshold)||vadThreshold<=0||vadThreshold>=1||!Number.isFinite(silenceMs)||silenceMs<200||silenceMs>3000)throw new Error('Invalid audio VAD calibration');
type User={id:string;email?:string;desktop:boolean};
async function authenticate(token:string):Promise<User> {
  if(demo) { if(token!=='demo')throw new HttpError(401,'Demo accepts only demo credentials');return {id:'demo',email:'demo@localhost',desktop:false}; }
  if(!pool||!jwks) throw new HttpError(503,'Authentication is not configured');
  // Browser sessions present a Neon Auth JWT; the desktop presents an opaque Ctrue token (64 hex, no dots).
  if(token.includes('.')) {
    try {
      const {payload}=await jwtVerify(token,jwks,{issuer,audience:issuer,algorithms:['EdDSA']});
      if(!payload.sub)throw new errors.JWTInvalid('Missing subject');
      return {id:payload.sub,email:typeof payload.email==='string'?payload.email:undefined,desktop:false};
    } catch(e) {
      if(e instanceof errors.JOSEError&&!(e instanceof errors.JWKSTimeout)&&!(e instanceof errors.JWKSInvalid)&&e.code!=='ERR_JOSE_GENERIC')throw new HttpError(401,'Sign in again');
      console.error('Neon Auth key lookup failed:',e instanceof Error?e.message:e);throw new HttpError(503,'Authentication service unavailable');
    }
  }
  // Anything else is refused before it costs a database query.
  if(!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401,'Sign in again');
  const [row]=await sql<{user_id:string;email:string|null}>('select user_id,email from desktop_tokens where access_hash=$1 and access_expires>now()',[sha256(token)]);
  if(!row) throw new HttpError(401,'Sign in again');
  return {id:row.user_id,email:row.email??undefined,desktop:true};
}
const users=new WeakMap<Request,User>();
const limits=new Map<string,{count:number;until:number}>();
function rate(key:string,max=120) {
  const now=Date.now();
  if(limits.size>10000) for(const [k,v] of limits) if(v.until<=now) limits.delete(k);
  const value=limits.get(key);
  if(!value||value.until<=now) limits.set(key,{count:1,until:now+60_000});
  else if(++value.count>max) throw new HttpError(429,'Too many requests; retry in one minute');
}
// Failed sign-ins are counted per address and a flood of bad tokens is cut off. Successful requests are only limited per
// user, because many people can share one address behind an office network or a proxy.
const authFailures=(ip:string|undefined)=>{const value=limits.get(`authfail:${ip}`);return !!value&&value.until>Date.now()&&value.count>=60;};
async function auth(req:Request,_res:Response,next:NextFunction) {
  try {
    const token=string(req.headers.authorization?.replace(/^Bearer /,''),'access token',8000);
    let user:User;
    try{user=await authenticate(token);}catch(e){if(e instanceof HttpError&&e.status===401)rate(`authfail:${req.ip}`,Infinity);throw e;}
    // The local demo is one identity shared by every test and tab on this machine; real users are limited per user.
    if(user.id!=='demo')rate(user.id);users.set(req,user);next();
  }catch(e){next(e);}
}
function user(req:Request) { const value=users.get(req);if(!value)throw new HttpError(401,'Sign in required');return value; }
async function action(uid:string,id:string|null,op:string):Promise<Session> {
  if(demo && uid==='demo')return store.action(id,op);
  const [row]=await sql<{session:Session}>('select public.session_action($1,$2,$3,$4,$5) as session',[uid,id,op,trial,metered]);
  return row.session;
}
async function active(uid:string,id:string) {const s=await action(uid,id,'get');if(s.status!=='active'||(metered&&s.remainingSeconds<=0))throw new HttpError(409,'Start or resume a session with available credits');return s;}
// The owner uses the server's key; everyone else brings their own, sent with each request and never stored.
async function aiKey(uid:string,supplied:unknown):Promise<string> {
  if(demo)return '';
  const [row]=await sql<{plan:string}>('select plan from accounts where user_id=$1',[uid]);
  if(row?.plan==='owner'){if(!env.OPENAI_API_KEY)throw new HttpError(503,'AI provider is not configured');return env.OPENAI_API_KEY;}
  if(supplied===undefined||supplied==='')throw new HttpError(402,'Add your OpenAI API key in the Ctrue desktop app (Preferences) to get answers');
  return openaiKey(supplied);
}
function providerError(e:unknown) {
  if(e instanceof HttpError)return e;
  const status=typeof e==='object'&&e!==null&&'status' in e?e.status:undefined;
  if(status===401)return new HttpError(402,'Your OpenAI API key was rejected. Check it in Preferences');
  if(status===429)return new HttpError(429,'Your OpenAI account hit its rate limit or has no credit left');
  if(e instanceof OpenAI.APIError)return new HttpError(502,`OpenAI error: ${e.message}`);
  return e;
}
async function profile(uid:string,facts?:string) {
  if(demo && uid==='demo')return store.profile(facts);
  await action(uid,null,'account');
  const [row]=facts===undefined?await sql<{facts:string}>('select facts from accounts where user_id=$1',[uid]):await sql<{facts:string}>('update accounts set facts=$2 where user_id=$1 returning facts',[uid,facts]);
  return row;
}
// Behind a hosting proxy every request arrives from the proxy's address, so per-address rate limits would treat all
// users as one. TRUST_PROXY is the number of proxies in front (0 locally, usually 1 when hosted).
const trustedProxies=Number(env.TRUST_PROXY||0);
if(!Number.isInteger(trustedProxies)||trustedProxies<0||trustedProxies>5)throw new Error('Invalid TRUST_PROXY');
const app=express();app.disable('x-powered-by');app.set('trust proxy',trustedProxies);
app.use(cors({origin(origin,cb){cb(originAllowed(origin)?null:new HttpError(403,'Origin denied'),originAllowed(origin));}}));
app.get('/health',(_req,res)=>res.json({status:'ok',mode:demo?'demo':'live',configured}));
// An address with 60 failed sign-ins this minute is refused before its body is even parsed.
app.use((req,_res,next)=>next(authFailures(req.ip)?new HttpError(429,'Too many failed sign-ins; retry in one minute'):undefined));
app.use(express.json({limit:'5mb'}));
app.use((req,_res,next)=>{if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)))next(new HttpError(400,'Expected JSON object'));else {req.body??={};next();}});
const mint=()=>({accessToken:randomBytes(32).toString('hex'),refreshToken:randomBytes(32).toString('hex')});
app.post('/auth/redeem',async(req,res)=>{
  rate(`redeem:${req.ip}`,15);const who=handoffs.redeem(string(req.body.code,'code',64));
  if(demo){res.json({accessToken:'demo',refreshToken:'demo'});return;}
  const tokens=mint();await sql('select public.desktop_token_issue($1,$2,$3,$4)',[who.id,who.email??null,sha256(tokens.accessToken),sha256(tokens.refreshToken)]);
  res.json(tokens);
});
// ponytail: a rotation whose response is lost signs that desktop out; add a reuse grace window if that proves common.
app.post('/auth/refresh',async(req,res)=>{
  rate(`refresh:${req.ip}`,30);const previous=string(req.body.refreshToken,'refresh token',200),tokens=mint();
  const [row]=await sql<{rotated:boolean}>('select public.desktop_token_rotate($1,$2,$3) as rotated',[sha256(previous),sha256(tokens.accessToken),sha256(tokens.refreshToken)]);
  if(!row.rotated)throw new HttpError(401,'Login expired. Sign in again');
  res.json(tokens);
});
app.post('/auth/logout',async(req,res)=>{
  rate(`logout:${req.ip}`,30);const refreshToken=string(req.body.refreshToken,'refresh token',200);
  if(pool)await sql('delete from desktop_tokens where refresh_hash=$1',[sha256(refreshToken)]);
  res.json({signedOut:true});
});
app.use(auth);
app.get('/account',async(req,res)=>{const u=user(req),a=await action(u.id,null,'account');res.json(demo&&u.id==='demo'?{balanceSeconds:a.remainingSeconds,plan:'DEMO',email:u.email}:{...a,email:u.email,metered});});
app.post('/sessions',async(req,res)=>res.json(await action(user(req).id,null,'start')));
for(const op of ['heartbeat','pause','resume','end'])app.post(`/sessions/:id/${op}`,async(req,res)=>res.json(await action(user(req).id,uuid(req.params.id),op)));
app.get('/profile',async(req,res)=>res.json(await profile(user(req).id)));
app.put('/profile',async(req,res)=>{if(typeof req.body.facts!=='string'||req.body.facts.length>50000)throw new HttpError(400,'Facts must be at most 50,000 characters');res.json(await profile(user(req).id,req.body.facts));});
app.delete('/profile',async(req,res)=>res.json(await profile(user(req).id,'')));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8_000_000,files:1,fields:0}});
app.post('/profile/import',upload.single('file'),async(req,res)=>{
  const file=req.file;if(!file)throw new HttpError(400,'Choose a PDF or DOCX file');let facts:string;
  try {
    if(file.originalname.toLowerCase().endsWith('.pdf')&&file.buffer.subarray(0,5).toString()==='%PDF-')facts=(await pdf(new Uint8Array(file.buffer))).text;
    else if(file.originalname.toLowerCase().endsWith('.docx')&&file.buffer.subarray(0,2).toString()==='PK'){docxSize(file.buffer);facts=(await mammoth.extractRawText({buffer:file.buffer})).value;}
    else throw new HttpError(400,'Expected PDF or DOCX');
  }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Could not extract this document');}
  if(!facts.trim()||facts.length>50000)throw new HttpError(400,'Document is empty, scanned, or too long');
  // Extraction stays transient: the user must approve/edit facts with PUT /profile.
  res.json({facts:facts.trim()});
});
app.post('/auth/handoff',async(req,res)=>{
  const u=user(req);rate(`handoff:${u.id}`,6);
  // Only a verified browser sign-in may connect a desktop; a desktop credential cannot clone itself.
  if(u.desktop)throw new HttpError(403,'Connect the desktop app from the website');
  // The desktop gets its own Ctrue credential at redemption; no browser or provider session is cloned.
  await action(u.id,null,'account');
  res.json(handoffs.issue({id:u.id,email:u.email}));
});
const answering=new Set<string>();
app.post('/answers',async(req,res,next)=>{
  const u=user(req);let check:ReturnType<typeof setInterval>|undefined,ownsAnswer=false;const abort=new AbortController();
  try {
    rate(`answers:${u.id}`,12);const id=uuid(req.body.sessionId),question=string(req.body.question,'question',16000),mode=string(req.body.mode,'mode',20);
    if(!['technical','coding','behavioral','system-design','walkthrough'].includes(mode))throw new HttpError(400,'Invalid answer mode');
    const walk=mode==='walkthrough',topic=req.body.topic==='system-design'?'system-design':'coding',language=walk&&topic==='coding'?string(req.body.language,'language',20):'';
    if(walk&&topic==='coding'&&!(LANGUAGES as readonly string[]).includes(language))throw new HttpError(400,'Unsupported language');
    // One screenshot (image) or several consecutive parts of the same page (images), at most four.
    const supplied:unknown[]=Array.isArray(req.body.images)?req.body.images:req.body.image===undefined?[]:[req.body.image];
    if(supplied.length>4)throw new HttpError(400,'At most four screenshots per question');
    const pictures=supplied.map((value:unknown)=>imageData(value)).filter((value:string|undefined):value is string=>!!value),context=req.body.context===undefined?'':req.body.context;
    if(typeof context!=='string'||context.length>30000)throw new HttpError(400,'Invalid context');
    await active(u.id,id);if(answering.has(u.id))throw new HttpError(409,'Cancel the current answer first');
    answering.add(u.id);ownsAnswer=true;
    const key=await aiKey(u.id,req.headers['x-openai-key']);
    req.on('aborted',()=>abort.abort());res.on('close',()=>abort.abort());
    // A client that left during the checks above already fired 'close', which listeners never see; stop here.
    if(req.socket.destroyed)return;
    const facts=(await profile(u.id)).facts;
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();
    const send=(event:string,data:unknown)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
    // Every 5 s (a pause stops the answer within 5 s); one check at a time so a slow database cannot pile them up.
    let checking=false;
    check=setInterval(()=>{if(checking)return;checking=true;void active(u.id,id).catch(()=>abort.abort()).finally(()=>{checking=false;});},5000);
    if(demo&&walk){for(const step of [{kind:'summary',phase:'none',title:'Demo walkthrough',say:'[DEMO, no AI request made] I will restate the problem, then build it step by step.',code:null,action:'none',replaces:null,why:null,breaks:null,details:'- Ask about input size\n- Brute force first, then optimize'},{kind:'step',phase:topic==='coding'?'optimal':'design',title:'First piece',say:'I start with the simplest building block.',code:topic==='coding'?'def solve(nums):\n    return nums':'Client -> API server',action:'add',replaces:null,why:'Small steps keep the explanation easy to follow.',breaks:topic==='coding'?null:'Without an API layer, clients talk to storage directly.',details:null},{kind:'final',phase:topic==='coding'?'optimal':'design',title:'Final solution',say:'That gives the complete solution.',code:topic==='coding'?'def solve(nums):\n    return nums':'Client -> API server',action:'none',replaces:null,why:null,breaks:null,details:'**Time:** O(n) · **Space:** O(1)'}])send('step',step);}
    else if(demo)send('token',{text:`[DEMO — no AI request made] Practice ${mode} response. Question: ${question.slice(0,250)}. ${mode==='behavioral'?'Use your verified facts to describe Situation, Task, Action, and Result.':'Explain your approach, then cover tradeoffs and edge cases.'}`});
    else {
      const scanner=new StepScanner();
      const stream=await new OpenAI({apiKey:key}).responses.create({model:env.OPENAI_MODEL||'gpt-4.1-mini',instructions:walk?walkPrompt(topic,language):prompt(mode,facts),...(walk?{text:{format:{type:'json_schema' as const,name:'walkthrough',schema:WALK_SCHEMA,strict:true}}}:{}),input:[{role:'user',content:[{type:'input_text',text:`Recent context:\n${context}\nQuestion:\n${question}${pictures.length>1?`\n\nThe ${pictures.length} screenshots are consecutive parts of the same page, in order; read them together.`:''}\n\nReply in English only, even if the text above is in another language.`},...pictures.map(url=>({type:'input_image' as const,image_url:url,detail:'auto' as const}))]}],stream:true,max_output_tokens:walk?8000:2500,store:false},{signal:abort.signal});
      let completed=false;
      for await(const event of stream){if(event.type==='response.output_text.delta'){if(!walk)send('token',{text:event.delta});else for(const found of scanner.push(event.delta)){const step=toWalkStep(found);if(!step)throw new HttpError(502,'The AI returned a malformed step. Completed steps are kept; press Retry to continue.');send('step',step);}}else if(event.type==='response.completed')completed=true;
        // A length cut-off keeps what was written; anything else is reported with OpenAI's own reason.
        else if(event.type==='response.incomplete'){const why=event.response.incomplete_details?.reason;if(why!=='max_output_tokens')throw new HttpError(502,`The AI stopped early (${why||'no reason given'})`);if(walk)throw new HttpError(502,'The walkthrough hit the length limit. Completed steps are kept; press Retry to continue.');send('token',{text:'\n\n_(Answer cut off at the length limit. Ask a follow-up to continue.)_'});completed=true;}
        else if(event.type==='response.failed')throw new HttpError(502,`The AI request failed: ${event.response.error?.message||'no reason given'}`);
        else if(event.type==='error')throw new HttpError(502,`The AI request failed: ${event.message||'no reason given'}`);}
      if(!completed)throw new HttpError(502,'The AI stream ended before the answer finished. Try again.');
    }
    if(abort.signal.aborted)send('error',{error:'Answer stopped; check session status'});else send('done',{});res.end();
  }catch(caught){const e=providerError(caught);if(!(caught instanceof HttpError))console.error('Answer failed:',caught instanceof Error?caught.message:caught);if(res.headersSent){if(!res.destroyed)res.end(`event: error\ndata: ${JSON.stringify({error:e instanceof HttpError?e.message:'Answer interrupted or unavailable'})}\n\n`);}else next(e);}
  finally{if(check)clearInterval(check);if(ownsAnswer)answering.delete(u.id);abort.abort();}
});
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{const status=typeof err==='object'&&err!==null&&'status' in err?err.status:undefined;const error=err instanceof HttpError?err:err instanceof multer.MulterError?new HttpError(400,'File exceeds upload limits'):status===413?new HttpError(413,'Request exceeds size limit'):status===400?new HttpError(400,'Invalid JSON'):new HttpError(500,'Request failed');if(!res.headersSent)res.status(error.status).json({error:error.message});});

const server=createServer(app),wss=new WebSocketServer({server,path:'/transcription',maxPayload:100000});
// The newest transcription for a user replaces any older one: after a network switch the old socket may linger
// half-open for minutes, and refusing the new one would leave the user unable to listen.
const transcribing=new Map<string,WebSocket>();
wss.on('connection',(socket,req)=>{
  if(!originAllowed(req.headers.origin)){socket.close(1008,'Origin denied');return;}
  let uid:string|undefined, sessionId:string|undefined, provider:WebSocket|undefined,started=false,ready=false,busy=false,checking=false;
  const turns=new AudioTurns(vadThreshold,silenceMs),budget=new AudioBudget();
  const startup=setTimeout(()=>socket.close(1008,'Start message required'),10000);
  const send=(value:unknown)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));};
  const fail=(error:string)=>{send({type:'error',error});socket.close(1011,'Transcription stopped');provider?.close();};
  const lease=setInterval(async()=>{if(!uid||!sessionId||checking)return;checking=true;try{await active(uid,sessionId);}catch{fail('Session paused, expired, or exhausted');}finally{checking=false;}},5000);
  socket.on('message',async raw=>{
    try {
      const message=JSON.parse(raw.toString());
      if(!started) {
        if(busy)throw new HttpError(400,'Wait for ready');busy=true;
        if(message.type!=='start')throw new HttpError(400,'Start message required');
        const u=await authenticate(string(message.accessToken,'access token',8000));rate(`ws:${u.id}`,6);sessionId=uuid(message.sessionId);
        // Independent lookups, made at once: each is a database round trip, and listening waits for both.
        const [,key]=await Promise.all([active(u.id,sessionId),aiKey(u.id,message.openaiKey)]);
        transcribing.get(u.id)?.close(4001,'Replaced by a newer transcription');
        uid=u.id;transcribing.set(uid,socket);
        started=true;clearTimeout(startup);
        if(socket.readyState!==WebSocket.OPEN){if(transcribing.get(uid)===socket)transcribing.delete(uid);return;}
        if(demo){ready=true;send({type:'ready'});send({type:'final',id:'demo-1',text:'[DEMO — no audio transcription] Tell me about a project you built.'});return;}
        // OPENAI_REALTIME_URL points the relay at a local stand-in for tests, as OPENAI_BASE_URL does for answers.
        provider=new WebSocket(env.OPENAI_REALTIME_URL||'wss://api.openai.com/v1/realtime?intent=transcription',{headers:{Authorization:`Bearer ${key}`}});
        provider.on('unexpected-response',(_request,response)=>fail(response.statusCode===401?'Your OpenAI API key was rejected. Check it in Preferences':'Could not connect to transcription provider'));
        provider.on('open',()=>provider?.send(JSON.stringify({type:'session.update',session:{type:'transcription',audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:env.OPENAI_TRANSCRIPTION_MODEL||'gpt-live-transcribe',language:transcriptionLanguage,...(transcriptionLanguage==='en'?{prompt:'The speakers use English. Write the transcript in English only.'}:{})},turn_detection:null}}}})));
        provider.on('message',raw=>{try{const e=JSON.parse(raw.toString());if(e.type==='session.updated'){ready=true;send({type:'ready'});}else if(e.type==='conversation.item.input_audio_transcription.delta')send({type:'partial',id:e.item_id,text:e.delta});else if(e.type==='conversation.item.input_audio_transcription.completed')send({type:'final',id:e.item_id,text:e.transcript});else if(e.type==='error'&&e.error?.code==='invalid_api_key')fail('Your OpenAI API key was rejected. Check it in Preferences');else if(e.type==='error'||e.type==='conversation.item.input_audio_transcription.failed')fail('Transcription provider failed');}catch{fail('Invalid provider response');}});
        provider.on('error',()=>fail('Could not connect to transcription provider'));provider.on('close',()=>{if(socket.readyState===WebSocket.OPEN)fail('Transcription connection closed');});
      }else{
        if(message.type!=='audio'||!ready)throw new HttpError(400,'Wait for ready before sending PCM audio');
        const data=string(message.data,'audio',90000);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4!==0)throw new HttpError(400,'Invalid base64 audio');
        const bytes=Buffer.from(data,'base64');if(bytes.length%2!==0||bytes.length>48000)throw new HttpError(400,'PCM audio must contain at most one second of 24kHz mono PCM16');
        budget.consume(bytes.length);
        rate(`audio:${uid}`,2000);
        if(!demo){if(provider?.bufferedAmount!>256000)throw new HttpError(429,'Audio connection congested');provider?.send(JSON.stringify({type:'input_audio_buffer.append',audio:data}));const turn=turns.append(bytes);if(turn)provider?.send(JSON.stringify({type:`input_audio_buffer.${turn}`}));}
      }
    }catch(e){fail(e instanceof HttpError?e.message:'Invalid transcription message');}
  });
  socket.on('error',()=>socket.close());socket.on('close',()=>{clearTimeout(startup);clearInterval(lease);if(uid&&transcribing.get(uid)===socket)transcribing.delete(uid);provider?.close();});
});
server.listen(port,host,()=>console.log(`Ctrue API ${demo?'DEMO (no paid services)':'live'} http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{for(const socket of wss.clients)socket.close(1001,'API shutting down');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();});

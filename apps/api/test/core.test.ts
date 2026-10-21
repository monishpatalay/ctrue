import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {AudioBudget,AudioTurns,DemoStore,Handoffs,StepScanner,docxSize,imageData,openaiKey,prompt,toWalkStep,uuid,walkPrompt} from '../src/core.js';
test('lease expiry caps disconnected charges; pause/resume/end are idempotent',()=>{
  let now=0;const store=new DemoStore(()=>now),first=store.action(null,'start');
  assert.equal(store.action(null,'start').id,first.id);
  now=5000;assert.equal(store.action(first.id,'heartbeat').remainingSeconds,595);
  now=100000;let s=store.action(first.id,'get');assert.equal(s.status,'paused');assert.equal(s.remainingSeconds,580);assert.equal(s.elapsedSeconds,20);
  now=200000;assert.equal(store.action(first.id,'pause').remainingSeconds,580);
  store.action(first.id,'resume');now+=3000;s=store.action(first.id,'pause');assert.equal(s.remainingSeconds,577);
  assert.equal(store.action(first.id,'pause').remainingSeconds,577);store.action(first.id,'end');assert.equal(store.action(first.id,'resume').status,'ended');
});
test('resume cannot create two active sessions and exhausted credits stop capture',()=>{
  let now=0;const store=new DemoStore(()=>now),first=store.action(null,'start');store.action(first.id,'pause');const second=store.action(null,'start');
  assert.throws(()=>store.action(first.id,'resume'),/Another session/);store.action(second.id,'end');
  for(let i=0;i<40;i++){const s=store.action(null,'start');now+=15000;store.action(s.id,'get');}
  assert.throws(()=>store.action(null,'start'),/Credits exhausted/);
});
test('handoff is random, single-use, expires; untrusted boundary inputs rejected',()=>{
  let now=0;const h=new Handoffs<{id:string}>(()=>now),a=h.issue({id:'user'});assert.match(a.code,/^[a-f0-9]{64}$/);
  assert.deepEqual(h.redeem(a.code),{id:'user'});assert.throws(()=>h.redeem(a.code),/already used/);
  const b=h.issue({id:'other'});now=60000;assert.throws(()=>h.redeem(b.code),/expired/);
  assert.throws(()=>imageData('https://example.com/private'),/Expected/);assert.throws(()=>uuid('../bad'),/Invalid/);
  assert.match(prompt('behavioral','Built a tool'),/Never invent/);
});
test('PCM turn commits only after voiced speech followed by silence',()=>{
  const turns=new AudioTurns(),speech=Buffer.alloc(4800),silence=Buffer.alloc(4800);
  for(let i=0;i<speech.length;i+=2)speech.writeInt16LE(2000,i);
  assert.equal(turns.append(silence),null);assert.equal(turns.append(speech),null);
  for(let i=0;i<5;i++)assert.equal(turns.append(silence),null);assert.equal(turns.append(silence),'commit');
});
test('fifteen seconds of pure silence is cleared, never sent for transcription',()=>{
  const turns=new AudioTurns(),second=Buffer.alloc(48000),voiced=Buffer.alloc(48000);
  for(let i=0;i<voiced.length;i+=2)voiced.writeInt16LE(2000,i);
  for(let i=0;i<14;i++)assert.equal(turns.append(second),null);
  assert.equal(turns.append(second),'clear','silence must not be committed: the provider invents text from it');
  // Speech that is still going at the 15 s cap is committed so long monologues are transcribed in pieces.
  for(let i=0;i<14;i++)turns.append(voiced);
  assert.equal(turns.append(voiced),'commit');
});
test('rapid pause/resume carries fractional usage instead of granting free seconds',()=>{
  let now=0;const store=new DemoStore(()=>now),s=store.action(null,'start');
  for(let i=0;i<10;i++){now+=150;store.action(s.id,'pause');now+=10000;store.action(s.id,'resume');}
  assert.equal(store.action(s.id,'get').remainingSeconds,599);
});
test('document expansion guard rejects malformed and oversized ZIPs',()=>{
  assert.throws(()=>docxSize(Buffer.from('PK')),/Invalid/);
  function archive(contents:Buffer, declared=contents.length, method=8) {
    const data=method===8?deflateRawSync(contents):contents;
    const local=Buffer.alloc(31);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(declared,22);local.writeUInt16LE(1,26);local[30]=120;
    const central=Buffer.alloc(47);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(declared,24);central.writeUInt16LE(1,28);central[46]=120;
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length+data.length,16);
    return Buffer.concat([local,data,central,end]);
  }
  assert.doesNotThrow(()=>docxSize(archive(Buffer.from('resume text'))));
  assert.doesNotThrow(()=>docxSize(archive(Buffer.from('resume text'),11,0)));
  assert.throws(()=>docxSize(archive(Buffer.alloc(33_000_001),1)),/expands/);
  assert.throws(()=>docxSize(archive(Buffer.from('resume text'),1)),/size/);
  const invalid=archive(Buffer.from('resume text'));invalid.writeUInt32LE(0xffffffff,invalid.length-6);
  assert.throws(()=>docxSize(invalid),/Invalid/);
});
test('audio byte budget allows realtime with jitter but rejects accelerated audio',()=>{
  let now=0;const budget=new AudioBudget(()=>now);
  budget.consume(480000);
  assert.throws(()=>budget.consume(2),/realtime/);
  for(let n=0;n<100;n++){now+=200;assert.doesNotThrow(()=>budget.consume(9600));}
  now+=100000;budget.consume(480000);
  assert.throws(()=>budget.consume(2),/realtime/);
  assert.throws(()=>budget.consume(-1),/Invalid/);
});
test('audio the desktop buffered through an 8 s network stall is accepted when it arrives in one burst',()=>{
  // The desktop keeps up to ~8 s of 200 ms frames queued before giving up (capture.ts); all of it lands at once.
  let now=0;const budget=new AudioBudget(()=>now);
  for(let n=0;n<40;n++)budget.consume(9600);
  for(let n=0;n<50;n++){now+=200;assert.doesNotThrow(()=>budget.consume(9600));}
});
test('a user OpenAI key must look like one before it is used', () => {
  assert.equal(openaiKey('  sk-proj-abcdefghijklmnopqrstuvwxyz0123  '), 'sk-proj-abcdefghijklmnopqrstuvwxyz0123');
  for (const bad of ['', 'not-a-key', 'sk-short', 'sk-has spaces in it and more', 'Bearer sk-abcdefghijklmnopqrstuvwxyz']) assert.throws(() => openaiKey(bad));
});
test('walkthrough steps are emitted only when complete, even with braces in code and arbitrary chunking',()=>{
  const step=(title:string,code:string|null)=>({kind:'step',phase:'optimal',title,say:'I add this.',code,action:'add',replaces:null,why:null,breaks:null,details:null});
  const json=JSON.stringify({steps:[step('Loop','for (int i = 0; i < n; i++) { if (s.charAt(i) == \'}\') print("{\\"x\\"}"); }'),step('Return',null)]});
  for(const size of [1,3,7,json.length]){
    const scanner=new StepScanner(),found:unknown[]=[];
    for(let i=0;i<json.length;i+=size)found.push(...scanner.push(json.slice(i,i+size)));
    assert.deepEqual(found,JSON.parse(json).steps,`chunk size ${size}`);
  }
  const partial=new StepScanner();
  assert.deepEqual(partial.push(JSON.stringify({steps:[step('Done',null)]}).slice(0,-30)),[],'an unfinished step is never emitted');
});
test('walkthrough steps are validated and the prompt treats the problem as data',()=>{
  const ok={kind:'final',phase:'optimal',title:'Final',say:'Here it is.',code:'x',action:'none',replaces:null,why:null,breaks:null,details:'O(n)'};
  assert.deepEqual(toWalkStep(ok),ok);
  assert.equal(toWalkStep({...ok,kind:'html'}),null);
  assert.equal(toWalkStep({...ok,say:''}),null);
  assert.equal(toWalkStep({...ok,code:42}),null);
  assert.equal(toWalkStep({...ok,extra:'<script>'})?.hasOwnProperty('extra'),false);
  assert.match(walkPrompt('coding','Python'),/untrusted data/);
  assert.match(walkPrompt('coding','Go'),/Language: Go/);
  assert.match(walkPrompt('system-design',''),/breaks = what goes wrong later without it/);
});
test('screenshots must be PNG, JPEG or WEBP data URLs',()=>{
  for(const ok of ['data:image/png;base64,iVBORw0KGgo=','data:image/jpeg;base64,/9j/4AAQ','data:image/webp;base64,UklGRg==']) assert.equal(imageData(ok),ok);
  for(const bad of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/gif;base64,R0lGOD==','data:image/png;base64,abc def','data:text/html;base64,PGI+','']) assert.throws(()=>imageData(bad),/Expected|Invalid/,bad);
  assert.equal(imageData(undefined),undefined);
});
test('pending sign-ins are capped at 1000 and expired codes make room',()=>{
  let now=0;const h=new Handoffs<{id:string}>(()=>now);
  for(let i=0;i<1000;i++)h.issue({id:`u${i}`});
  assert.throws(()=>h.issue({id:'one-more'}),/Too many pending/);
  now=60000;assert.doesNotThrow(()=>h.issue({id:'after-expiry'}));
  assert.throws(()=>h.redeem('A'.repeat(64)),/Invalid handoff code/);
});
test('the step scanner copes with escaped backslashes, nested arrays and text before the steps',()=>{
  const step={kind:'step',phase:'brute',title:'Path',say:'Windows paths end in a backslash.',code:'print("C:\\\\")  # ["not", {"a": "step"}]',action:'add',replaces:null,why:null,breaks:null,details:'- [x] done'};
  const json=JSON.stringify({steps:[step,{...step,title:'Two'}]});
  for(const size of [1,2,5]){const scanner=new StepScanner(),found:unknown[]=[];for(let i=0;i<json.length;i+=size)found.push(...scanner.push(json.slice(i,i+size)));assert.deepEqual(found,[step,{...step,title:'Two'}],`chunk ${size}`);}
});
test('walkthrough steps over any field limit are refused',()=>{
  const ok={kind:'step',phase:'design',title:'T',say:'S',code:null,action:'add',replaces:null,why:null,breaks:null,details:null};
  for(const [field,max] of [['title',200],['say',2000],['code',20000],['replaces',8000],['why',1000],['breaks',1000],['details',8000]] as const){
    assert.notEqual(toWalkStep({...ok,[field]:'x'.repeat(max)}),null,`${field} at its limit`);
    assert.equal(toWalkStep({...ok,[field]:'x'.repeat(max+1)}),null,`${field} over its limit`);
  }
  assert.equal(toWalkStep({...ok,title:'   '}),null);assert.equal(toWalkStep({...ok,phase:'optimal ',}),null);assert.equal(toWalkStep(null),null);
});
test('an OpenAI key longer than 300 characters is refused before use',()=>{
  assert.equal(openaiKey('sk-'+'a'.repeat(297)).length,300);
  assert.throws(()=>openaiKey('sk-'+'a'.repeat(298)));
});
test('DOCX archives that are encrypted, use other compression or hold too many entries are refused',()=>{
  function archive(entries:number, flags=0, method=8){
    const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
    for(let n=0;n<entries;n++){
      const data=method===8?deflateRawSync(Buffer.from('x')):Buffer.from('x');
      const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(1,22);
      const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(1,24);central.writeUInt32LE(offset,42);
      locals.push(local,data);centrals.push(central);offset+=local.length+data.length;
    }
    const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries,8);end.writeUInt16LE(entries,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
    return Buffer.concat([...locals,directory,end]);
  }
  assert.doesNotThrow(()=>docxSize(archive(3)));
  assert.throws(()=>docxSize(archive(2001)),/too many entries/);
  assert.throws(()=>docxSize(archive(1,1)),/Invalid DOCX/);
  assert.throws(()=>docxSize(archive(1,0,12)),/Invalid DOCX/);
});
test('a spoken question is picked out of chatter and other languages, or answered with NO_QUESTION',()=>{
  const spoken=prompt('technical','',true),typed=prompt('technical','');
  assert.match(spoken,/small talk/);assert.match(spoken,/other languages/);assert.match(spoken,/exactly NO_QUESTION/);
  assert.doesNotMatch(typed,/NO_QUESTION/);
});

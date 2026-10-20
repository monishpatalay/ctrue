import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

// A local stand-in for the two OpenAI endpoints the API calls, so contract tests never leave the machine.
// The API reaches it through OPENAI_BASE_URL (answers) and OPENAI_REALTIME_URL (transcription).
// Answers pick their behaviour from a marker in the question, e.g. "[mock:slow]"; a key containing "invalid" is refused.
const STEP = { kind: 'step', phase: 'optimal', title: 'First piece', say: 'I start small.', code: 'def solve(nums):\n    return {nums}', action: 'add', replaces: null, why: null, breaks: null, details: null };

export async function startMockOpenAI() {
  const state = { answers: 0, open: 0, abandoned: 0, sockets: 0, appended: 0, commits: 0, clears: 0, realtime: 'ok' };
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.endsWith('/responses')) { res.writeHead(404).end(); return; }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = body.input?.[0]?.content?.[0]?.text || '';
    const marker = prompt.match(/\[mock:([a-z0-9]+)\]/)?.[1] || '';
    state.answers++;
    const refuse = (status, message, code) => res.writeHead(status, { 'content-type': 'application/json', 'x-should-retry': 'false' }).end(JSON.stringify({ error: { message, type: 'invalid_request_error', code } }));
    if (String(req.headers.authorization).includes('invalid')) return refuse(401, 'Incorrect API key provided: sk-test-****0000.', 'invalid_api_key');
    if (marker === '429') return refuse(429, 'Rate limit reached for requests', 'rate_limit_exceeded');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    state.open++;
    let closed = false;
    res.on('close', () => { closed = true; state.open--; if (!res.writableEnded) state.abandoned++; });
    const send = (type, extra = {}) => { if (!closed) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const walk = body.text?.format?.type === 'json_schema';
    if (marker === 'slow') for (let i = 0; i < 100 && !closed; i++) { send('response.output_text.delta', { delta: `${i} ` }); await wait(100); }
    else if (walk) {
      const steps = marker === 'badstep' ? [STEP, { ...STEP, say: '' }] : [{ ...STEP, kind: 'summary', phase: 'none', title: 'Two sum', code: null, action: 'none' }, STEP];
      const json = JSON.stringify({ steps });
      for (let i = 0; i < json.length; i += 7) send('response.output_text.delta', { delta: json.slice(i, i + 7) });
    } else for (const delta of ['Hello', ' world']) send('response.output_text.delta', { delta });
    if (marker === 'incomplete') send('response.incomplete', { response: { incomplete_details: { reason: 'max_output_tokens' } } });
    else if (marker === 'filtered') send('response.incomplete', { response: { incomplete_details: { reason: 'content_filter' } } });
    else if (marker === 'failed') send('response.failed', { response: { error: { message: 'upstream exploded' } } });
    else if (marker !== 'truncated') send('response.completed', { response: { status: 'completed' } });
    if (!closed) res.end();
  });
  // Realtime transcription: session.update -> session.updated; each commit transcribes as "What is a hash map?".
  const realtime = new WebSocketServer({ server, path: '/v1/realtime', verifyClient: (info, done) => done(!String(info.req.headers.authorization).includes('invalid'), 401) });
  realtime.on('connection', socket => {
    state.sockets++;
    let item = 0;
    const send = value => socket.send(JSON.stringify(value));
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString());
      if (event.type === 'session.update') {
        if (state.realtime === 'error') send({ type: 'error', error: { code: 'server_error', message: 'mock failure' } });
        else if (state.realtime === 'close') socket.close();
        else send({ type: 'session.updated' });
      } else if (event.type === 'input_audio_buffer.append') state.appended += Buffer.from(event.audio, 'base64').length;
      else if (event.type === 'input_audio_buffer.clear') state.clears++;
      else if (event.type === 'input_audio_buffer.commit') {
        state.commits++;
        const item_id = `item_${++item}`;
        send({ type: 'conversation.item.input_audio_transcription.delta', item_id, delta: 'What is ' });
        send({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript: 'What is a hash map?' });
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    state,
    env: { OPENAI_BASE_URL: `${origin}/v1`, OPENAI_REALTIME_URL: `${origin.replace('http', 'ws')}/v1/realtime?intent=transcription` },
    close: () => { for (const socket of realtime.clients) socket.terminate(); realtime.close(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); },
  };
}

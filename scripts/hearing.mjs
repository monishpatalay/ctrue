import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocketClient from 'ws';
import { launch } from './api-contract.mjs';

// How well Ctrue hears a call: spoken interview questions go through the real API and real OpenAI transcription at
// live speed, under several conditions, and come back scored. npm run test:hearing with CTRUE_TEST_OPENAI_KEY set
// (your key; a few cents). macOS only (`say`). TTS is cleaner than a real call, so treat the numbers as a lower bound.
const PORT = 55438, RATE = 24000, CHUNK = 4800; // the desktop sends 200 ms chunks (pcm-worklet.js)
const SENTENCES = [
  ['Samantha', 'Can you explain the difference between a hash map and a binary search tree?'],
  ['Daniel', 'How would you design a rate limiter for a public API?'],
  ['Rishi', "Walk me through how you would find the shortest path in a weighted graph using Dijkstra's algorithm."],
  ['Karen', 'What happens when you type a URL into the browser and press enter?'],
  ['Aman', 'Tell me about a time you disagreed with your manager and how you handled it.'],
  ['Samantha', 'How does Kubernetes decide where to schedule a pod?'],
  ['Daniel', 'What is the time complexity of merge sort, and why is it stable?'],
  ['Rishi', 'Explain the difference between optimistic and pessimistic locking in a database.'],
];
const db = value => 10 ** (value / 20);
// Speech level is RMS over the voiced audio; -26 dBFS is a normal call, -40 a quiet one.
const CONDITIONS = [
  { name: 'normal', level: -26 },
  { name: 'quiet', level: -40 },
  { name: 'very quiet', level: -48 },
  { name: 'background noise', level: -26, noise: -38 },
  { name: 'pause mid-sentence', level: -26, pause: 0.9 },
  { name: 'call compression', level: -26, codec: true },
  { name: 'background music', level: -26, music: -34 },
  // A second person talks over the start of each question; their words count as errors, so expect a higher rate.
  { name: 'talked over', level: -26, over: 'Sorry, can you hear me? I think my internet is lagging.' },
];

function say(voice, text) {
  const file = join(tmpdir(), `ctrue-hearing-${process.pid}.wav`);
  execFileSync('say', ['-v', voice, '-o', file, '--data-format=LEI16@24000', text]);
  const wav = readFileSync(file);
  let offset = 12;
  while (wav.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + wav.readUInt32LE(offset + 4);
  const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  return Float32Array.from({ length: pcm.length >> 1 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
}
const silence = seconds => new Float32Array(Math.round(seconds * RATE));
const join32 = parts => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
function scaled(samples, level) {
  const voiced = samples.filter(s => Math.abs(s) > 0.003);
  const rms = Math.sqrt(voiced.reduce((n, s) => n + s * s, 0) / voiced.length);
  return samples.map(s => s * db(level) / rms);
}
// Low-passed white noise (a fan or room hum), at the given RMS.
function noisy(samples, level) {
  let last = 0;
  const noise = samples.map(() => (last = 0.9 * last + 0.1 * (Math.random() * 2 - 1)));
  const rms = Math.sqrt(noise.reduce((n, s) => n + s * s, 0) / noise.length);
  return samples.map((s, i) => s + noise[i] * db(level) / rms);
}
// Opus at 16 kbit/s, a call on a weak connection (needs ffmpeg).
function compressed(samples) {
  const raw = join(tmpdir(), `ctrue-hearing-${process.pid}.raw`), opus = `${raw}.opus`;
  writeFileSync(raw, Buffer.from(Int16Array.from(samples, s => Math.round(Math.max(-1, Math.min(1, s)) * 32767)).buffer));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw, '-c:a', 'libopus', '-b:a', '16k', opus]);
  const back = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', opus, '-f', 's16le', '-ar', '24000', '-ac', '1', '-'], { maxBuffer: 1 << 28 });
  const out = Float32Array.from({ length: back.length >> 1 }, (_, i) => back.readInt16LE(i * 2) / 32768);
  return out.length >= samples.length ? out.subarray(0, samples.length) : join32([out, silence((samples.length - out.length) / RATE)]);
}
// Chords that change every half second, at the given RMS.
function withMusic(samples, level) {
  const notes = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
  const music = samples.map((_, i) => { const t = i / RATE, chord = notes[Math.floor(t * 2) % notes.length], env = 0.6 + 0.4 * Math.cos(Math.PI * 2 * t * 2); return env * chord.reduce((n, f) => n + Math.sin(2 * Math.PI * f * t), 0) / 3; });
  const rms = Math.sqrt(music.reduce((n, s) => n + s * s, 0) / music.length);
  return samples.map((s, i) => s + music[i] * db(level) / rms);
}
function audioFor(condition) {
  const marks = [], ends = [], parts = [silence(1)];
  let at = RATE;
  for (const [voice, text] of SENTENCES) {
    let speech;
    if (condition.pause) {
      const words = text.split(' '), half = Math.ceil(words.length / 2);
      speech = join32([say(voice, words.slice(0, half).join(' ')), silence(condition.pause), say(voice, words.slice(half).join(' '))]);
    } else speech = say(voice, text);
    if (condition.over) { const other = say('Moira', condition.over).map(s => s * 0.5), mixed = speech.slice(); other.forEach((s, i) => { if (i < mixed.length) mixed[i] += s; }); speech = mixed; }
    marks.push(at / RATE); ends.push((at + speech.length) / RATE);
    parts.push(speech, silence(4));
    at += speech.length + 4 * RATE;
  }
  parts.push(silence(3));
  let samples = join32(parts);
  samples = scaled(samples, condition.level);
  if (condition.noise) samples = noisy(samples, condition.noise);
  if (condition.music) samples = withMusic(samples, condition.music);
  if (condition.codec) samples = compressed(samples);
  return { samples, marks, ends };
}
const words = text => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
function errors(reference, heard) {
  const a = words(reference), b = words(heard);
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return { wrong: row[b.length], total: a.length };
}

async function listen({ base, bearer, sessionId, key, samples, marks, ends }) {
  const socket = new WebSocketClient(`${base.replace('http', 'ws')}/transcription`), finals = [], stops = [];
  let started = 0, failure = '', ready = false;
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'ready') ready = true;
    if (message.type === 'quiet') stops.push((performance.now() - started - message.ago) / 1000);
    if (message.type === 'final') finals.push({ text: message.text, at: (performance.now() - started) / 1000 });
    if (message.type === 'error') failure = message.error || 'error';
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'start', accessToken: bearer, sessionId, openaiKey: key }));
  for (let i = 0; i < 100 && !ready && !failure; i++) await wait(100);
  if (!ready) throw new Error(`transcription never became ready: ${failure}`);
  started = performance.now();
  for (let i = 0; i < samples.length && !failure; i += CHUNK) {
    const pcm = Buffer.alloc(CHUNK * 2);
    samples.subarray(i, i + CHUNK).forEach((s, j) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), j * 2));
    socket.send(JSON.stringify({ type: 'audio', data: pcm.toString('base64') }));
    // Live pace, measured against the clock so timers drifting late never send faster than real time.
    const due = started + ((i + CHUNK) / RATE) * 1000;
    await wait(Math.max(0, due - performance.now()));
  }
  await wait(3000);
  socket.close();
  if (failure) throw new Error(failure);
  // A final belongs to the last sentence that had started speaking before it arrived.
  return SENTENCES.map(([, text], index) => {
    const mine = finals.filter(f => f.at >= marks[index] && (index === marks.length - 1 || f.at < marks[index + 1]));
    // When the app starts answering (App.tsx): 1.8 s after the last stop, or once the text is in if that is later.
    const stop = stops.filter(at => at >= marks[index] && at < mine.at(-1)?.at).at(-1) ?? mine.at(-1)?.at;
    const answer = mine.length ? Math.max(stop + 1.8, mine.at(-1).at) - ends[index] : null;
    return { text, heard: mine.map(f => f.text).join(' '), pieces: mine.length, delay: mine.length ? mine.at(-1).at - ends[index] : null, answer };
  });
}

export async function hearing({ databaseUrl, authBase, token }, setups = [{ name: 'current', env: {} }]) {
  const key = process.env.CTRUE_TEST_OPENAI_KEY;
  if (!key) throw new Error('Set CTRUE_TEST_OPENAI_KEY to run the hearing check (it uses your own key and costs a few cents).');
  const audio = CONDITIONS.map(condition => ({ condition, ...audioFor(condition) }));
  const report = ['# How well Ctrue hears', '', `${SENTENCES.length} interview questions, 5 voices, ${CONDITIONS.length} conditions, streamed at live speed. Word error rate: lower is better.`, ''];
  const summary = [];
  for (const setup of setups) {
    const api = await launch(PORT, { DATABASE_URL: databaseUrl, NEON_AUTH_BASE_URL: authBase, TRUST_PROXY: '1', ...setup.env });
    try {
      console.log(`  ${setup.name}: ${JSON.stringify(setup.env)}`);
      report.push(`## ${setup.name}`, '', '```', JSON.stringify(setup.env), '```', '', '| Condition | Word error rate | Missed questions | Pieces per question | Text arrives after speech ends | Answer starts after speech ends |', '|---|---|---|---|---|---|');
      const detail = [];
      // One listener per condition, side by side (one transcription per account, so each gets its own).
      const results = await Promise.all(audio.map(async ({ condition, samples, marks, ends }, index) => {
        const bearer = await token(`hearing-${index}`);
        const call = (path, body) => fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) }).then(r => r.json());
        const session = await call('/sessions', {});
        const heartbeat = setInterval(() => void call(`/sessions/${session.id}/heartbeat`, {}).catch(() => {}), 5000);
        try { return { condition, rows: await listen({ base: `http://127.0.0.1:${PORT}`, bearer, sessionId: session.id, key, samples, marks, ends }) }; }
        finally { clearInterval(heartbeat); await call(`/sessions/${session.id}/pause`, {}).catch(() => {}); }
      }));
      for (const { condition, rows } of results) {
        const score = rows.map(row => errors(row.text, row.heard));
        const wrong = score.reduce((n, s) => n + s.wrong, 0), total = score.reduce((n, s) => n + s.total, 0);
        const missed = rows.filter(row => !row.heard.trim()).length, pieces = (rows.reduce((n, r) => n + r.pieces, 0) / rows.length).toFixed(1);
        const delays = rows.map(r => r.delay).filter(d => d !== null).sort((a, b) => a - b), delay = delays.length ? `${delays[delays.length >> 1].toFixed(1)} s` : '—';
        const answers = rows.map(r => r.answer).filter(d => d !== null).sort((a, b) => a - b), answer = answers.length ? `${answers[answers.length >> 1].toFixed(1)} s` : '—';
        const rate = `${Math.round((wrong / total) * 100)}%`;
        report.push(`| ${condition.name} | ${rate} | ${missed} of ${rows.length} | ${pieces} | ${delay} | ${answer} |`);
        summary.push(`${setup.name.padEnd(12)} ${condition.name.padEnd(20)} WER ${rate.padStart(4)}  missed ${missed}/${rows.length}  pieces ${pieces}  text ${delay}  answer ${answer}`);
        detail.push(`### ${condition.name}`, '', ...rows.map(row => `- said: ${row.text}\n  heard: ${row.heard || '_(nothing)_'}`), '');
      }
      report.push('', ...detail);
    } catch (error) {
      console.log(`  API log:\n${api.logs().trim().split('\n').slice(-15).map(line => `    ${line}`).join('\n')}`);
      throw error;
    } finally { await api.stop(); }
  }
  console.log(summary.map(line => `  ${line}`).join('\n'));
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/hearing-report.md', report.join('\n'));
  console.log('  Details written to test-results/hearing-report.md');
}

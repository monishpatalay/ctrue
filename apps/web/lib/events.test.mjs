import test from 'node:test';
import assert from 'node:assert/strict';
import { readEvents } from './events.mjs';
const encoder = new TextEncoder();
function stream(text) { const bytes = encoder.encode(text); return new ReadableStream({ start(controller) { for (let i=0;i<bytes.length;i+=2) controller.enqueue(bytes.slice(i,i+2)); controller.close(); } }); }
async function output(text) { let answer=''; for await (const token of readEvents(stream(text))) answer+=token; return answer; }
test('SSE handles split UTF-8, CRLF, provider errors, and interrupted answers',async()=>{
 assert.equal(await output('event: token\r\ndata: {"text":"Hello 🌱"}\r\n\r\nevent: token\ndata: {"text":" world"}\n\nevent: done\ndata: {}\n\n'),'Hello 🌱 world');
 await assert.rejects(output('event: error\ndata: {"error":"Credits exhausted"}\n\n'),/Credits exhausted/);
 await assert.rejects(output('event: token\ndata: {"text":"unfinished"}\n\n'),/before completion/);
 await assert.rejects(output('event: token\ndata: {"text":3}\n\n'),/invalid token/);
});

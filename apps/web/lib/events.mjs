// ponytail: fetch streams cover this one SSE endpoint; no EventSource dependency needed.
export async function* readEvents(body) {
  if (!body) throw new Error('The service returned no answer stream.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data = [];
  let eventSize = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error('The answer stream exceeded the event size limit.');
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) {
          eventSize += line.length;
          if (eventSize > 1024 * 1024) throw new Error('The answer stream exceeded the event size limit.');
          data.push(line.slice(5).replace(/^ /, ''));
        }
        else if (!line) {
          if (data.length) {
            let value;
            try { value = JSON.parse(data.join('\n')); } catch { throw new Error('The answer stream contained invalid data.'); }
            if (event === 'error') throw new Error(typeof value?.error === 'string' ? value.error : 'Answer generation failed.');
            if (event === 'token') {
              if (typeof value?.text !== 'string') throw new Error('The answer stream contained an invalid token.');
              yield value.text;
            }
            if (event === 'done') { return; }
          }
          event = ''; data = []; eventSize = 0;
        }
      }
      if (chunk.done) break;
    }
    throw new Error('The answer stream ended before completion. Please try again.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

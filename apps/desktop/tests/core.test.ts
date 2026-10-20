import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultShortcuts, isNewerVersion, parseHandoff, trustedService, validateShortcuts } from '../electron/security';
import { acceleratorFrom, heardSince, isNewProblem, parseMarkdown, prettyShortcut, readEvents, recentSpeech, updateTranscript } from '../src/api';
import { encodePCM16 } from '../public/pcm-worklet.js';
import { buildCode, resumeContext, stepsMatchFinal, type WalkStep } from '../src/steps';

test('credentials handoff allows only the expected protocol, host and bounded code', () => {
  const code = 'a'.repeat(43);
  assert.equal(parseHandoff(`ctrue://auth?code=${code}`), code);
  for (const link of [`https://auth?code=${code}`, `ctrue://evil?code=${code}`, 'ctrue://auth?code=short', `ctrue://auth?code=${code}&redirect=https://evil.com`]) assert.throws(() => parseHandoff(link));
});
test('service URLs and global shortcuts reject unsafe or ambiguous values', () => {
  assert.equal(trustedService('http://localhost:4318'), 'http://localhost:4318');
  assert.equal(trustedService('https://api.example.com'), 'https://api.example.com');
  assert.throws(() => trustedService('http://example.com'));
  assert.throws(() => trustedService('https://user:password@example.com'));
  assert.deepEqual(validateShortcuts(defaultShortcuts), defaultShortcuts);
  assert.throws(() => validateShortcuts({ ...defaultShortcuts, hide: defaultShortcuts.capture }));
  assert.throws(() => validateShortcuts({ ...defaultShortcuts, hide: 'rm -rf' }));
});
test('audio conversion emits clamped signed little-endian PCM16', () => {
  const view = new DataView(encodePCM16(new Float32Array([-2, -1, 0, 1, 2, NaN])));
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(i * 2, true)), [-32768, -32768, 0, 32767, 32767, 0]);
});
test('answer parser handles split chunks and refuses a disconnected stream', async () => {
  const encoder = new TextEncoder();
  const chunks = ['event: tok', 'en\ndata: {"text":"hello"}\n\n', 'event: done\ndata: {}\n\n'];
  const stream = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
  const tokens: string[] = [];
  await readEvents(new Response(stream), (event, value) => { if (event === 'token') tokens.push(value.text!); });
  assert.deepEqual(tokens, ['hello']);
  await assert.rejects(() => readEvents(new Response('event: token\ndata: {"text":"partial"}\n\n'), () => {}), /disconnected/);
});
test('partial transcript deltas accumulate and final text replaces them exactly once', () => {
  const first = updateTranscript([], 'partial', 'a', 'What ');
  const second = updateTranscript(first, 'partial', 'a', 'is a queue?');
  assert.equal(second[0].text, 'What is a queue?');
  const final = updateTranscript(second, 'final', 'a', 'What is a queue?');
  assert.equal(final.length, 1); assert.equal(final[0].final, true);
  assert.strictEqual(updateTranscript(final, 'partial', 'a', 'late delta'), final);
});
test('a question split across pauses is answered whole, and never mid-sentence', () => {
  const said = [{ id: 'a', text: 'So', final: true, at: 0 }, { id: 'b', text: 'What is the difference between generative AI and', final: true, at: 0 }];
  assert.equal(heardSince([...said, { id: 'c', text: ' Agent', final: false, at: 0 }], 'a'), null);
  const whole = heardSince([...said, { id: 'c', text: 'Agent API', final: true, at: 0 }], 'a');
  assert.deepEqual(whole, { text: 'What is the difference between generative AI and Agent API', lastId: 'c' });
  assert.equal(heardSince([...said, { id: 'c', text: 'Agent API', final: true, at: 0 }], 'c'), null);
  assert.equal(heardSince(said, 'gone')?.text, 'So What is the difference between generative AI and');
});
test('transcript keeps English and drops fragments written in another script', () => {
  const english = updateTranscript([], 'final', 'a', 'What’s a hash map? It costs $5 — fine.');
  assert.equal(english.length, 1);
  const partial = updateTranscript(english, 'partial', 'b', 'And screen could ');
  assert.equal(updateTranscript(partial, 'final', 'b', 'And screen could कुछ में').length, 1);
  for (const noise of ['あらい', '嗯', 'फिर घूम के', 'بول']) assert.equal(updateTranscript(english, 'final', 'c', noise).length, 1);
});
test('answer markup becomes structure, including a code block still streaming', () => {
  const blocks = parseMarkdown('Use a hash map.\nIt is O(n).\n\n### Steps\n1. **Scan:** once\n2. Look up\n   - nested\n3. Done\n---\n```python\nfor i in x:\n    pass');
  assert.deepEqual(blocks.map(b => b.type), ['text', 'heading', 'list', 'list', 'list', 'rule', 'code']);
  assert.deepEqual(blocks[0], { type: 'text', text: 'Use a hash map. It is O(n).' });
  assert.deepEqual(blocks[2], { type: 'list', ordered: true, start: 1, items: ['**Scan:** once', 'Look up'] });
  assert.deepEqual(blocks[4], { type: 'list', ordered: true, start: 3, items: ['Done'] });
  assert.deepEqual(blocks[6], { type: 'code', text: 'for i in x:\n    pass' });
});
test('a screenshot taken while listening carries only what was said recently', () => {
  let heard = updateTranscript([], 'final', 'a', 'Tell me about yourself.', 1000);
  heard = updateTranscript(heard, 'final', 'b', 'Now look at this code.', 50000);
  heard = updateTranscript(heard, 'partial', 'c', 'Why does line twelve fail', 58000);
  assert.equal(recentSpeech(heard, 60000, 20000), 'Now look at this code. Why does line twelve fail');
  assert.equal(recentSpeech(heard, 200000, 20000), '');
  assert.equal(recentSpeech([], 60000, 20000), '');
});
test('a pressed key combination becomes a valid shortcut; lone keys and lone modifiers do not', () => {
  const press = (code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => acceleratorFrom({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, code, ...mods });
  assert.equal(press('KeyK', { metaKey: true }), 'CommandOrControl+K');
  assert.equal(press('Digit2', { ctrlKey: true, shiftKey: true }), 'CommandOrControl+Shift+2');
  assert.equal(press('Enter', { altKey: true }), 'Alt+Enter');
  assert.equal(press('KeyK'), null);
  assert.equal(press('MetaLeft', { metaKey: true }), null);
  assert.equal(press('ArrowUp', { metaKey: true }), null);
  for (const made of [press('KeyK', { metaKey: true })!, press('F5', { shiftKey: true })!]) assert.equal(validateShortcuts({ ...defaultShortcuts, capture: made }).capture, made);
  assert.equal(prettyShortcut('CommandOrControl+Shift+Enter'), '⌘ ⇧ ↩');
  // Shift alone with a typing key would make that capital letter (or Shift+Enter) unusable in every app.
  assert.equal(press('KeyK', { shiftKey: true }), null);
  assert.equal(press('Enter', { shiftKey: true }), null);
  for (const typing of ['Shift+K', 'Shift+Enter', 'Shift+Space']) assert.throws(() => validateShortcuts({ ...defaultShortcuts, capture: typing }), /Invalid shortcut/, typing);
});
test('settings saved before the add-screenshot shortcut still load, and its key cannot clash', () => {
  const { collect, ...older } = defaultShortcuts;
  assert.equal(validateShortcuts(older).collect, collect);
  assert.throws(() => validateShortcuts({ ...older, hide: collect }));
});

test('isNewerVersion compares release tags numerically', () => {
  assert.equal(isNewerVersion('v0.1.4', '0.1.3'), true);
  assert.equal(isNewerVersion('v0.1.10', '0.1.9'), true);
  assert.equal(isNewerVersion('v0.1.3', '0.1.3'), false);
  assert.equal(isNewerVersion('v0.1.2', '0.1.3'), false);
  assert.equal(isNewerVersion('v1.0', '0.9.9'), true);
});

test('replaying walkthrough steps rebuilds the final code, including replacements', () => {
  const step = (code: string, action: 'add' | 'replace' = 'add', replaces: string | null = null, phase: WalkStep['phase'] = 'optimal'): WalkStep => ({ kind: 'step', phase, title: code.slice(0, 12), say: 'x', code, action, replaces, why: null, breaks: null, details: null });
  const steps: WalkStep[] = [
    step('for i in range(n):\n    pass', 'add', null, 'brute'),
    step('def solve(nums):\n    seen = set()'),
    step('    for n in nums:\n        pass'),
    step('        if n in seen:\n            return True\n        seen.add(n)', 'replace', '        pass'),
    step('    return False'),
    { kind: 'final', phase: 'optimal', title: 'Final', say: 'Done.', code: 'def solve(nums):\n    seen = set()\n    for n in nums:   \n        if n in seen:\n            return True\n        seen.add(n)\n    return False\n', action: 'none', replaces: null, why: null, breaks: null, details: null }
  ];
  assert.equal(buildCode(steps).code, 'def solve(nums):\n    seen = set()\n    for n in nums:\n        if n in seen:\n            return True\n        seen.add(n)\n    return False');
  assert.equal(stepsMatchFinal(steps), true);
  assert.equal(stepsMatchFinal([...steps.slice(0, 5), { ...steps[5], code: 'def solve(nums):\n    return False' }]), false);
  assert.deepEqual(buildCode([step('a'), step('b', 'replace', 'zzz')]).missing, ['b']);
  assert.equal(buildCode([step('fresh', 'replace', 'old brute force'), step('more')]).code, 'fresh\nmore', 'a first optimized step that replaces the brute force starts the file');
  assert.equal(stepsMatchFinal(steps.slice(0, 4)), null, 'no verdict before the final step arrives');
  // Code is inserted literally: "$'" and "$&" are replacement patterns to String.replace, not to the solution.
  const dollars = [step('function clean(s) {\n  return s;\n}'), step("  return s.replace('$', '').replace(/x/g, '$&$&');", 'replace', '  return s;')];
  assert.equal(buildCode(dollars).code, "function clean(s) {\n  return s.replace('$', '').replace(/x/g, '$&$&');\n}");
  assert.match(resumeContext(steps.slice(0, 2)), /^Steps already delivered/);
  assert.equal(resumeContext([]), '');
});

test('a spoken question mid-walkthrough is a new problem only when it names one', () => {
  for (const text of ['Can you build a system design for Amazon?', 'Now design Uber', 'Write a function that reverses a list', 'Given an array of integers, return two sums']) assert.equal(isNewProblem(text), true, text);
  for (const text of ['How would you scale this?', 'Why did you pick Kafka here?', 'Can you design it to handle failures?', 'What is the time complexity?']) assert.equal(isNewProblem(text), false, text);
  // Ordinary follow-ups use the same verbs with a lowercase word after them; only a name ("design Uber") or "a/an" starts a new problem.
  for (const text of ['How would you design the cache layer?', 'Can you write the tests for this?', 'Why did you code it this way?', 'Could you solve it without extra memory?', 'Can you implement this recursively?', 'Would you write any code differently?']) assert.equal(isNewProblem(text), false, text);
  for (const text of ['Design a URL shortener', 'Implement LRU cache', 'Build Twitter']) assert.equal(isNewProblem(text), true, text);
});

export async function readEvents(response: Response, receive: (event: string, value: { text?: string; error?: string; [key: string]: unknown }) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const lines = buffer.slice(0, end).split('\n'); buffer = buffer.slice(end + 2);
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (data) {
          const parsed = JSON.parse(data);
          if (event === 'error') throw new Error(parsed.error || 'Answer generation failed.');
          if (event === 'done') completed = true;
          receive(event, parsed);
        }
      }
      if (done) break;
    }
    if (!completed) throw new Error('Answer stream disconnected before completion. You can regenerate.');
  } finally { reader.releaseLock(); }
}
export function formatTime(seconds: number) { const n = Math.max(0, Math.floor(seconds)); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`; }
export type Transcript = { id: string; text: string; final: boolean; at: number };
// ponytail: English-only. A finished fragment written in another script is noise or another language; widen this
// range (or drop the check) to support more languages.
export const isEnglish = (text: string) => !/[^\u0000-\u024F\u2000-\u206F\u20A0-\u20CF]/.test(text);
export function updateTranscript(previous: Transcript[], type: string, id: string, text: string, now = Date.now()): Transcript[] {
  if (type === 'final' && !isEnglish(text)) return previous.filter(t => t.id !== id);
  const entry = previous.find(t => t.id === id);
  if (entry?.final && type === 'partial') return previous;
  const item = { id, text: type === 'partial' ? (entry?.text || '') + text : text, final: type === 'final', at: now };
  return (entry ? previous.map(t => t.id === id ? item : t) : [...previous, item]).slice(-200);
}
// During a walkthrough, decides whether a spoken question is a new problem or a follow-up about the current one.
// ponytail: keyword match. A follow-up phrased like a new task ("design a cache for this") starts a new walkthrough.
// The verb is matched in any case, but what follows must be "a/an" or a capitalised name ("design Uber"), so the
// capital check runs on each match outside the case-insensitive regex.
export const isNewProblem = (text: string) => {
  const said = text.replace(/\b(design|build)\s+(this|it|that)\b/gi, '');
  return /system design|\bgiven an?\s/i.test(said) || [...said.matchAll(/\b(?:design|build|create|implement|write|code|solve)\s+(an?\s|[A-Z])/gi)].some(match => /^(?:an?\s|[A-Z])/.test(match[1]));
};
// Polite or acknowledging phrases on a call ("Okay, great.", "Thank you", "Got it") are not questions to answer.
// ponytail: a word list; a short phrase made only of these words is skipped. Widen it if other fillers get answered.
const FILLER = new Set('ok okay sure yes yeah yep yup no nope right alright all cool great nice perfect good awesome fine excellent thanks thank you got it mhm mm hmm uh um huh oh ah so well and sounds makes sense understood i see'.split(' '));
export const isFiller = (text: string) => { const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean); return words.length <= 6 && words.every(word => FILLER.has(word)); };
// Speech arrives in fragments split at each short pause. This is everything said since the last answer, joined,
// or null while nothing is new or the newest fragment is still being spoken.
export function heardSince(transcript: Transcript[], answeredId: string): { text: string; lastId: string } | null {
  const pending = transcript.slice(transcript.findIndex(t => t.id === answeredId) + 1);
  const last = pending.at(-1);
  if (!last?.final) return null;
  return { text: pending.map(t => t.text.trim()).filter(Boolean).slice(-8).join(' '), lastId: last.id };
}
// ponytail: the Markdown subset the model actually emits (headings, lists, fenced code, rules, paragraphs).
// Swap in a Markdown library if tables or links are ever needed.
export type Block = { type: 'code' | 'heading' | 'text'; text: string } | { type: 'list'; ordered: boolean; start: number; items: string[] } | { type: 'rule' };
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // An unclosed fence (answer still streaming) runs to the end.
    if (/^\s*```/.test(line)) { const code: string[] = []; for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]); blocks.push({ type: 'code', text: code.join('\n') }); continue; }
    if (!line.trim()) continue;
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: 'rule' }); continue; }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) { blocks.push({ type: 'heading', text: heading[1] }); continue; }
    const item = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    const last = blocks.at(-1);
    if (item) {
      const ordered = item[1] !== undefined;
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item[2]);
      else blocks.push({ type: 'list', ordered, start: Number(item[1] || 1), items: [item[2]] });
      continue;
    }
    // Consecutive plain lines are one paragraph.
    if (last?.type === 'text' && lines[i - 1]?.trim()) last.text += ` ${line.trim()}`;
    else blocks.push({ type: 'text', text: line.trim() });
  }
  return blocks;
}
// What was said in the last few seconds, finished or still being spoken, for a screenshot taken mid-conversation.
export function recentSpeech(transcript: Transcript[], now: number, windowMs: number): string {
  return transcript.filter(t => now - t.at <= windowMs).map(t => t.text.trim()).filter(Boolean).join(' ');
}
// Turns a key press into an Electron accelerator, or null until a real key is pressed together with a modifier.
export function acceleratorFrom(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; code: string }): string | null {
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit\d$/.test(event.code) ? event.code.slice(5) : /^(Enter|Space|F([1-9]|1\d|2[0-4]))$/.test(event.code) ? event.code : null;
  const modifiers = [(event.metaKey || event.ctrlKey) && 'CommandOrControl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
  // Shift alone only combines with an F-key; with a letter it would just type a capital everywhere.
  return key && modifiers.length && (modifiers.join() !== 'Shift' || key.startsWith('F')) ? [...modifiers, key].join('+') : null;
}
const KEY_SYMBOLS: Record<string, string> = { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Enter: '↩' };
export const prettyShortcut = (value: string) => value.split('+').map(part => KEY_SYMBOLS[part] || part).join(' ');

// The same small Markdown subset the desktop app renders (apps/desktop/src/api.ts and Markdown.tsx); the two apps
// share no package, so keep them in step. Builds React elements, never HTML strings.
type Block = { type: 'code' | 'heading' | 'text'; text: string } | { type: 'list'; ordered: boolean; start: number; items: string[] } | { type: 'rule' };
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    if (last?.type === 'text' && lines[i - 1]?.trim()) last.text += ` ${line.trim()}`;
    else blocks.push({ type: 'text', text: line.trim() });
  }
  return blocks;
}
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.length > 4 && part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
}
export function Markdown({ text }: { text: string }) {
  return <>{parseMarkdown(text).map((block, i) => {
    if (block.type === 'list') {
      const items = block.items.map((item, j) => <li key={j}>{inline(item)}</li>);
      return block.ordered ? <ol key={i} start={block.start}>{items}</ol> : <ul key={i}>{items}</ul>;
    }
    if (block.type === 'code') return <pre key={i}><code>{block.text}</code></pre>;
    if (block.type === 'heading') return <h4 key={i}>{inline(block.text)}</h4>;
    if (block.type === 'rule') return <hr key={i} />;
    return <p key={i}>{inline(block.text)}</p>;
  })}</>;
}

import { parseMarkdown } from './api';

// Builds React elements, never HTML strings, so model output cannot inject markup.
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

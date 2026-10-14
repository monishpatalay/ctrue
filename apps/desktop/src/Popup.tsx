import { useEffect, useRef, useState } from 'react';
import { prettyShortcut } from './api';
import { Markdown } from './Markdown';
const key = (value: string) => prettyShortcut(value).replaceAll(' ', '');
import './popup.css';

// The pop-up only displays what the main window sends it and passes follow-up questions back.
type PopupState = { status: 'ready' | 'connecting' | 'listening' | 'thinking'; question: string; answer: string; heard: string; error: string; shots: number };
const initial: PopupState = { status: 'ready', question: '', answer: '', heard: '', error: '', shots: 0 };
const labels: Record<PopupState['status'], string> = { ready: 'Ready', connecting: 'Connecting…', listening: '● Listening', thinking: 'Thinking…' };

export function Popup() {
  const [state, setState] = useState(initial);
  const [followUp, setFollowUp] = useState('');
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState('');
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void window.ctrue?.config().then(({ shortcuts }) => setHint(`${key(shortcuts.capture)} listen · ${key(shortcuts.screenshot)} answer screen · ${key(shortcuts.collect)} add screen · ${key(shortcuts.hide)} hide`)).catch(() => {});
    return window.ctrue?.onEvent(event => { if (event.action === 'popup-state') { setState({ ...initial, ...(event.payload as Partial<PopupState>) }); setCopied(false); } });
  }, []);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [state.answer]);
  function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = followUp.trim();
    if (!text) return;
    setFollowUp(''); void window.ctrue?.popupAsk(text);
  }
  return <section className="popup" aria-label="Ctrue answer">
    <header className="popup-bar">
      <span className={`popup-status ${state.status}`}>{labels[state.status]}</span>
      <span className="popup-hint">{hint}</span>
      {state.answer && <button type="button" onClick={() => void navigator.clipboard.writeText(state.answer).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy'}</button>}
      <button type="button" aria-label="Hide pop-up" onClick={() => void window.ctrue?.popupHide()}>×</button>
    </header>
    <div className="popup-body" ref={body} aria-live="polite">
      {state.error && <p className="popup-error" role="alert">{state.error}</p>}
      {state.shots > 0 && <p className="popup-shots" role="status">{state.shots} screenshot{state.shots > 1 ? 's' : ''} ready. Scroll and add more, or press the screenshot shortcut to answer with all of them.</p>}
      {state.question ? <p className="popup-question">{state.question}</p> : state.heard && <p className="popup-heard">{state.heard}</p>}
      {state.answer ? <div className="popup-answer markdown"><Markdown text={state.answer} /></div> : !state.error && <p className="popup-empty">{state.status === 'listening' ? 'Listening to the call. The answer appears here when a question is asked.' : state.status === 'thinking' ? 'Working on it…' : 'Listen to the call or take a screenshot to get an answer here.'}</p>}
    </div>
    <form className="popup-follow" onSubmit={ask}>
      <input aria-label="Follow-up question" placeholder="Ask a follow-up…" value={followUp} onChange={event => setFollowUp(event.target.value)} maxLength={12000} />
      <button disabled={!followUp.trim() || state.status === 'thinking'}>Ask</button>
    </form>
  </section>;
}

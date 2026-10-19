import { useEffect, useRef, useState } from 'react';
import { prettyShortcut } from './api';
import { Markdown } from './Markdown';
import type { WalkStep } from './steps';
const key = (value: string) => prettyShortcut(value).replaceAll(' ', '');
import './popup.css';

// The pop-up only displays what the main window sends it and passes follow-up questions back.
type PopupState = { status: 'ready' | 'connecting' | 'listening' | 'thinking'; question: string; answer: string; heard: string; error: string; shots: number; history: { question: string; text: string }[]; walk: { step: WalkStep; index: number; total: number; more: boolean; explanation: string } | null };
const initial: PopupState = { status: 'ready', question: '', answer: '', heard: '', error: '', shots: 0, history: [], walk: null };
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
  useEffect(() => { if (!state.walk) body.current?.scrollTo({ top: body.current.scrollHeight }); }, [state.answer, state.walk]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [state.walk?.index]);
  const walk = state.walk;
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
      {!walk && state.history.map((item, i) => <article className="popup-past" key={i}><p className="popup-question">{item.question}</p><div className="popup-answer markdown"><Markdown text={item.text} /></div></article>)}
      {walk ? <article className="popup-walk">
        <p className="popup-walk-meta">Step {walk.index + 1} of {walk.total}{walk.more ? ' · more coming…' : ''} · {walk.step.title}</p>
        <p className="popup-walk-say"><strong>Say:</strong> {walk.step.say}</p>
        {walk.step.action === 'replace' && walk.step.replaces && <><p className="popup-walk-label">Replace:</p><pre className="popup-walk-old"><code>{walk.step.replaces}</code></pre><p className="popup-walk-label">With:</p></>}
        {walk.step.code && <pre><code>{walk.step.code}</code></pre>}
        {walk.step.why && <p className="popup-walk-why"><strong>Why:</strong> {walk.step.why}</p>}
        {walk.step.breaks && <p className="popup-walk-why"><strong>Without it:</strong> {walk.step.breaks}</p>}
        {walk.step.details && <div className="markdown"><Markdown text={walk.step.details} /></div>}
        {walk.explanation && <div className="popup-answer markdown"><Markdown text={walk.explanation} /></div>}
      </article> : state.question ? <p className="popup-question">{state.question}</p> : state.heard && <p className="popup-heard">{state.heard}</p>}
      {state.answer ? <div className="popup-answer markdown"><Markdown text={state.answer} /></div> : !state.error && <p className="popup-empty">{state.status === 'listening' ? 'Listening to the call. The answer appears here when a question is asked.' : state.status === 'thinking' ? 'Working on it…' : 'Listen to the call or take a screenshot to get an answer here.'}</p>}
    </div>
    {walk && <nav className="popup-walk-nav" aria-label="Walkthrough steps"><button type="button" disabled={walk.index === 0} onClick={() => void window.ctrue?.popupStep(-1)}>← Prev</button><button type="button" disabled={walk.index >= walk.total - 1} onClick={() => void window.ctrue?.popupStep(1)}>Next →</button></nav>}
    <form className="popup-follow" onSubmit={ask}>
      <input aria-label="Follow-up question" placeholder="Ask a follow-up…" value={followUp} onChange={event => setFollowUp(event.target.value)} maxLength={12000} />
      <button disabled={!followUp.trim() || state.status === 'thinking'}>Ask</button>
    </form>
  </section>;
}

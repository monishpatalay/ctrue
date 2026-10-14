import { Markdown } from './Markdown';
import { stepsMatchFinal, type WalkStep } from './steps';

const PHASES: Record<WalkStep['phase'], string> = { brute: 'Brute force', optimal: 'Optimized', design: 'Design', none: '' };
const KINDS: Record<WalkStep['kind'], string> = { summary: 'Understand the problem', step: '', complexity: 'Complexity', final: 'Final solution' };

type Props = {
  steps: WalkStep[]; index: number; onIndex: (index: number) => void;
  loading: boolean; error: string; onRetry: () => void; onCancel: () => void;
  explaining: boolean; explanation: string; onExplain: () => void;
};

export function Walkthrough({ steps, index, onIndex, loading, error, onRetry, onCancel, explaining, explanation, onExplain }: Props) {
  const step = steps[index];
  const last = index >= steps.length - 1;
  const matches = step?.kind === 'final' ? stepsMatchFinal(steps) : null;
  return <div className="walk">
    {step ? <article className="walk-step" aria-live="polite">
      <div className="walk-meta">
        <span className="pill">{[PHASES[step.phase], KINDS[step.kind]].filter(Boolean).join(' · ')}</span>
        <span className="muted">Step {index + 1} of {steps.length}{loading ? ' · more coming…' : ''}</span>
      </div>
      <h3>{step.title}</h3>
      <section className="walk-say"><div className="eyebrow">SAY THIS</div><p>{step.say}</p></section>
      {step.code && <section className="walk-code">
        <div className="eyebrow">{step.kind === 'final' ? 'COMPLETE SOLUTION' : step.phase === 'design' ? 'ADD THIS' : 'WRITE THIS'}{step.action === 'replace' ? <span className="walk-tag replace">Replace</span> : step.action === 'add' && step.kind === 'step' ? <span className="walk-tag">Add</span> : null}</div>
        {step.action === 'replace' && step.replaces && <><p className="fine-print">Replace these lines:</p><pre className="walk-old"><code>{step.replaces}</code></pre><p className="fine-print">With:</p></>}
        <pre><code>{step.code}</code></pre>
        <button className="ghost walk-copy" onClick={() => void navigator.clipboard.writeText(step.code!).catch(() => {})}>Copy code</button>
      </section>}
      {step.why && <p className="walk-why"><strong>Why:</strong> {step.why}</p>}
      {step.breaks && <p className="walk-why"><strong>Without it:</strong> {step.breaks}</p>}
      {step.details && <div className="markdown walk-details"><Markdown text={step.details} /></div>}
      {matches === false && <p className="fine-print walk-warn">The complete solution differs slightly from the steps above. Use the complete solution.</p>}
      {(explaining || explanation) && <section className="walk-explain"><div className="eyebrow">DEEPER EXPLANATION</div><div className="markdown"><Markdown text={explanation} />{explaining && <span className="stream-cursor">▌</span>}</div></section>}
    </article> : <div className="empty-answer"><h3>{loading ? 'Reading the problem…' : 'No steps yet.'}</h3><p className="muted">{loading ? 'The first step appears as soon as it is ready.' : 'Add the problem and press Start walkthrough.'}</p></div>}
    {error && <div className="walk-error" role="alert"><span>{error}</span><button className="secondary" onClick={onRetry}>{steps.length ? 'Retry from here' : 'Retry'}</button></div>}
    <div className="answer-actions walk-nav">
      <button className="secondary" disabled={index <= 0} onClick={() => onIndex(index - 1)}>← Previous</button>
      <button className="ghost" disabled={!step || explaining || loading} title={loading ? 'Available once all steps are ready' : undefined} onClick={onExplain}>Explain this step</button>
      {loading ? <button className="ghost" onClick={onCancel}>■ Cancel</button> : null}
      <button className="primary" disabled={last} onClick={() => onIndex(index + 1)}>Next →</button>
    </div>
  </div>;
}

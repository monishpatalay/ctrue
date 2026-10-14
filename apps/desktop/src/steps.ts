export type WalkStep = { kind: 'summary' | 'step' | 'complexity' | 'final'; phase: 'brute' | 'optimal' | 'design' | 'none'; title: string; say: string; code: string | null; action: 'add' | 'replace' | 'none'; replaces: string | null; why: string | null; breaks: string | null; details: string | null };
export const LANGUAGES = ['Python', 'Java', 'C++', 'JavaScript', 'TypeScript', 'Go'] as const;
export type Topic = 'coding' | 'system-design';

const normalize = (code: string) => code.replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').replace(/^\n+|\n+$/g, '');

// Replays the optimized steps in order: "add" appends, "replace" swaps the quoted earlier lines.
export function buildCode(steps: WalkStep[], phase: WalkStep['phase'] = 'optimal'): { code: string; missing: string[] } {
  let code = '';
  const missing: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'step' || step.phase !== phase || !step.code) continue;
    if (step.action === 'replace' && step.replaces) {
      const target = normalize(step.replaces), current = normalize(code);
      if (current.includes(target)) code = current.replace(target, normalize(step.code));
      else if (!current) code = normalize(step.code); // replacing the brute force with a fresh start
      else missing.push(step.title);
    } else code = code ? `${normalize(code)}\n${normalize(step.code)}` : normalize(step.code);
  }
  return { code, missing };
}

// Whether the final solution is exactly what following the steps produces (ignoring trailing whitespace).
export function stepsMatchFinal(steps: WalkStep[]): boolean | null {
  const final = steps.find(step => step.kind === 'final');
  if (!final?.code || final.phase !== 'optimal') return null;
  const { code, missing } = buildCode(steps);
  return missing.length === 0 && normalize(code) === normalize(final.code);
}

// Sent with a retry so the model continues after the steps already shown instead of starting over.
export function resumeContext(steps: WalkStep[]): string {
  return steps.length ? `Steps already delivered (continue after these; do not repeat them):\n${JSON.stringify(steps).slice(-24000)}` : '';
}

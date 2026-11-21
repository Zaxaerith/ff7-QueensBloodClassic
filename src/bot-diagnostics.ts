/** Development diagnostics contain counters/codes only, never cards, views or raw errors. */
export type BotFailureReason='timeout'|'worker-startup'|'worker-error'|'worker-message'|'search-error'|'rule-resolution'|'search-exhausted'|'invalid-action'|'missing-decision';
export interface BotDiagnostic {
  source:'worker'|'fallback'|'automatic-pass';
  reason:BotFailureReason|'decision'|'strategic-pass'|'no-legal-moves';
  elapsedMs:number;nodes:number|null;resolutionFailures:number;degraded:boolean;
}
export class BotWorkerFailure extends Error {
  constructor(message:string,readonly diagnostic:BotDiagnostic){super(message);this.name='BotWorkerFailure';}
}
export function resolutionFailure(error:unknown):boolean {
  const message=error instanceof Error?error.message:'';
  return /UNSTABLE_AURA|Continuous effect stabilization failed|Ability resolution exceeded safety limit|Power exceeds supported integer range/.test(message);
}
export function elapsedSince(started:number):number {return Math.round(Math.max(0,performance.now()-started)*10)/10;}

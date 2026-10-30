import { cn } from './ui';

export type AssistantOrbState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'speaking'
  | 'error'
  | 'stopped';

export const ORB_STATE_LABEL: Record<AssistantOrbState, string> = {
  idle: 'Assistant ready',
  listening: 'Listening for your voice',
  processing: 'Checking workspace records',
  responding: 'Preparing the answer',
  speaking: 'Reading the answer aloud',
  error: 'Assistant attention needed',
  stopped: 'Generation stopped',
};

export function AssistantOrb({
  state,
  size = 48,
  label,
  className,
}: {
  state: AssistantOrbState;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('assistant-orb', `assistant-orb--${state}`, className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="assistant-orb__halo" aria-hidden />
      <span className="assistant-orb__tilt assistant-orb__tilt--a" aria-hidden>
        <span className="assistant-orb__ring assistant-orb__ring--a" />
      </span>
      <span className="assistant-orb__tilt assistant-orb__tilt--b" aria-hidden>
        <span className="assistant-orb__ring assistant-orb__ring--b" />
      </span>
      <span className="assistant-orb__tilt assistant-orb__tilt--c" aria-hidden>
        <span className="assistant-orb__ring assistant-orb__ring--c" />
      </span>
      <span className="assistant-orb__core" aria-hidden />
    </span>
  );
}

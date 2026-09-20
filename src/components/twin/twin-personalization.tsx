'use client';

/**
 * Two opt-in switches for using the Digital Twin outside its own page. Both are
 * OFF by default and only appear for users on the Digital Twin plan who have an
 * enabled, trained twin (the API folds all of that into `twinReady`).
 *
 *   <CharacterMirrorToggle characterId={id} />  — mounted on /characters/[id]
 *   <TwinMatchingToggle />                      — mounted in the Digital Twin console
 */
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  busy: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

// Same switch treatment as profile/notification-preferences.tsx's ToggleDot.
function Switch({ checked, busy, label, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-10 h-5 rounded-full border transition-colors ease-premium relative shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
        checked ? "bg-gold-500 border-gold-500" : "bg-white/5 border-border-hairline",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-base transition-transform ease-premium",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function ToggleRow(props: { title: string; description: string; switchProps: SwitchProps; error: string | null }) {
  return (
    <div className="rounded-sm border border-border-hairline p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-text-primary">{props.title}</p>
          <p className="mt-1 text-xs text-text-tertiary">{props.description}</p>
        </div>
        <Switch {...props.switchProps} />
      </div>
      {props.error && <p role="alert" className="mt-2 text-xs text-danger">{props.error}</p>}
    </div>
  );
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
  if (body?.code === 'TWIN_NOT_READY') return 'Train your Digital Twin first.';
  if (body?.code === 'PLAN_GATED') return 'Digital Twin is a Premium feature.';
  return body?.error ?? 'Something went wrong. Please try again.';
}

/** Per-character: "let this character get to know how you talk". */
export function CharacterMirrorToggle({ characterId }: { characterId: string }) {
  const [state, setState] = useState<{ twinReady: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/twin/character-optin?characterId=${encodeURIComponent(characterId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { twinReady: boolean; enabled: boolean } | null) => { if (!cancelled && j) setState(j); })
      .catch(() => { /* stay hidden */ });
    return () => { cancelled = true; };
  }, [characterId]);

  const update = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/twin/character-optin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, enabled: next }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      setState(s => (s ? { ...s, enabled: next } : s));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [characterId]);

  // Hidden unless the user actually has an enabled Digital Twin.
  if (!state?.twinReady) return null;

  return (
    <ToggleRow
      title="Let this character get to know how you talk"
      description="Shares only your tone, humor and formality with this character so it can match your pace. Never your beliefs or private patterns. It stays fully itself, and you can turn this off any time."
      switchProps={{ checked: state.enabled, busy, label: 'Let this character get to know how you talk', onChange: update }}
      error={error}
    />
  );
}

/** Account-level: "use my twin to improve who I'm matched with". */
export function TwinMatchingToggle() {
  const [state, setState] = useState<{ twinEnabled: boolean; useForMatching: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/twin/personalization')
      .then(r => (r.ok ? r.json() : null))
      .then((j: { twinEnabled: boolean; useForMatching: boolean } | null) => { if (!cancelled && j) setState(j); })
      .catch(() => { /* stay hidden */ });
    return () => { cancelled = true; };
  }, []);

  const update = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/twin/personalization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useForMatching: next }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      setState(s => (s ? { ...s, useForMatching: next } : s));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!state?.twinEnabled) return null;

  return (
    <ToggleRow
      title="Use my twin to improve my matches"
      description="Your twin's humor, values and tone gently influence who shows up in Discover and Dating. This is scored privately on our servers and is never sent to an AI model."
      switchProps={{ checked: state.useForMatching, busy, label: 'Use my twin to improve my matches', onChange: update }}
      error={error}
    />
  );
}

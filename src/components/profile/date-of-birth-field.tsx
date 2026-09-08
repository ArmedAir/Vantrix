"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CinematicBackground } from "@/components/immersive/cinematic-background";
import { VerificationSeal } from "@/components/immersive/verification-seal";
import { cn } from "@/lib/utils";
import type { AgeVerificationStatus } from "@/types/age-verification";

const inputClass =
  "w-full rounded-sm bg-base border border-interactive px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60";

interface AgeVerificationRecord {
  status: AgeVerificationStatus;
  dateOfBirth: string | null;
  computedAge: number | null;
  verifiedAt: string | null;
}

const SEAL_STATE: Record<AgeVerificationStatus, "locked" | "pending" | "sealed" | "declined"> = {
  unverified: "locked",
  expired: "locked",
  pending: "pending",
  verified: "sealed",
  rejected: "declined",
};

/**
 * VERIFICATION-UI: previously a bare labeled input with no visibility into
 * *which* age_verifications.status (age-gate.ts) the account was actually
 * in — a user in 'pending' manual review looked identical to one who'd
 * never submitted anything. Now reads the full record from GET
 * /api/profile/date-of-birth (already returned status/computedAge/
 * verifiedAt — this just displays what was already there) and renders a
 * status card using the same VerificationSeal motif as MatureAccessGate,
 * so "verified" reads as the same credential on both the settings page
 * and the character-detail gate it unlocks.
 *
 * Still separate from SettingsForm on purpose: date of birth lives behind
 * its own rate-limited endpoint (GET/PATCH /api/profile/date-of-birth,
 * age-gate.ts) rather than the general profile/settings route, so it
 * gets its own fetch + save cycle instead of being folded into the
 * bigger form's single submit.
 *
 * The date field stays visible and editable in every status — including
 * 'verified' — because the backend allows corrections at any time (see
 * age-gate.ts: a change from 'verified' or 'unverified' re-checks age
 * immediately; a change from 'rejected' always routes to manual 'pending'
 * review instead of self-approving). This component doesn't need to know
 * that policy in detail, only to always offer the same single form and
 * let the returned status drive what the card above it shows.
 */
export function DateOfBirthField() {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [record, setRecord] = useState<AgeVerificationRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile/date-of-birth")
      .then((res) => res.json())
      .then((body) => {
        if (body?.ageVerification) {
          setRecord(body.ageVerification);
          if (body.ageVerification.dateOfBirth) {
            setDateOfBirth(body.ageVerification.dateOfBirth.slice(0, 10));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/date-of-birth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't update your date of birth.");
        return;
      }
      // The route only echoes {status, message} on success, not the full
      // record — merge in what changed rather than re-fetching, so the
      // card updates immediately without a second round trip.
      setRecord((prev) => ({
        status: body.status,
        dateOfBirth,
        computedAge: prev?.computedAge ?? null,
        verifiedAt: body.status === "verified" ? new Date().toISOString() : null,
      }));
    } catch {
      setError("Couldn't update your date of birth. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const status = record?.status ?? "unverified";
  const { headline, detail } = statusCopy(status, record);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-md border border-border-hairline px-6 py-8 text-center">
        <CinematicBackground intensity="subtle" />
        <VerificationSeal state={SEAL_STATE[status]} className="relative" />
        <p className="relative mt-4 font-display text-lg text-text-primary">
          {headline}
        </p>
        <p className="relative mt-1 text-sm text-text-secondary">{detail}</p>
      </div>

      <form onSubmit={save} className="space-y-2">
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Date of birth
        </label>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={cn(inputClass, "h-11 flex-1 [color-scheme:dark]")}
          />
          <Button type="submit" variant="secondary" disabled={saving || !dateOfBirth}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">
          Limited to a few changes per day. Used only to confirm you&apos;re 18
          or older.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}

function statusCopy(
  status: AgeVerificationStatus,
  record: AgeVerificationRecord | null
): { headline: string; detail: string } {
  switch (status) {
    case "verified": {
      const age = record?.computedAge;
      const date = record?.verifiedAt
        ? new Date(record.verifiedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : null;
      return {
        headline: "Verified",
        detail:
          age && date
            ? `Confirmed at ${age} \u00b7 ${date}`
            : "Your age is confirmed. Mature content is available to you.",
      };
    }
    case "pending":
      return {
        headline: "Under review",
        detail:
          "Your submission needs a manual check before it's confirmed — this doesn't happen instantly.",
      };
    case "rejected":
      return {
        headline: "Verification unsuccessful",
        detail:
          "Vantrix requires members to be 18 or older. Any further change is reviewed manually.",
      };
    case "expired":
      return {
        headline: "Verification expired",
        detail: "Re-enter your date of birth below to verify again.",
      };
    default:
      return {
        headline: "Not yet verified",
        detail: "Enter your date of birth below to verify you're 18 or older.",
      };
  }
}

"use client";

import type { Database }        from "@/types/supabase";
import { createBrowserClient }  from "@supabase/ssr";

// NEXT_PUBLIC_* vars are inlined at build time by Next.js.
// During `next build` static page generation these are undefined — we fall
// back to placeholder values so the build succeeds. At runtime in a real
// browser the real values must be present (enforced by env.ts at server boot).
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "https://placeholder.supabase.co";
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

// The installed PWA and the plain website are the same origin, so by default
// Supabase's browser client (localStorage-backed) shares ONE auth session
// between them. That means logging into Account B on the website silently
// signs out / overwrites Account A in the installed app (and vice versa) —
// users can't stay on two different accounts on one device.
//
// Fix: give the installed (standalone) PWA its own storage key, isolated
// from the website's session. Each surface keeps its own login.
function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const PWA_STORAGE_KEY = "vantrix-auth-pwa";
const WEB_STORAGE_KEY = "vantrix-auth-web";
// Separate from PWA_STORAGE_KEY on purpose: PWA_STORAGE_KEY's *absence* is
// not itself a safe migration trigger, because it's also what an
// intentional PWA sign-out looks like. Without this flag, every call to
// createClient() after a deliberate sign-out in the installed app would
// see "no PWA session" and silently re-copy the web session back in,
// undoing the sign-out. This flag makes the migration a true one-shot:
// attempted once per device, never repeated, regardless of outcome.
const PWA_MIGRATION_FLAG = "vantrix-pwa-session-migrated";

// BUG FIX (2026-09-13): the storage-key split below is correct and
// intentional (see comment), but it has a launch-day edge case that was
// shipping as a real user-facing bug: someone who was already logged in
// on the website, then installs the PWA, opens it for the first time --
// and lands on a fresh, empty "vantrix-auth-pwa" slot with no session in
// it. The server-rendered page still looks logged in (it reads the
// session from cookies, which ARE shared across web/PWA), but any
// client-side auth check reads this browser client's session and finds
// nothing -- producing exactly the "page rendered, then something on top
// of it acts logged out" pattern users reported ("home layout locked").
//
// Fix: on a standalone launch, before creating the client, check once
// whether a web session already exists and the PWA slot has never been
// touched. If so, copy the raw session value over. This runs inside
// createClient() (called fresh in several places, not a singleton) but is
// self-limiting: after the first copy, PWA_STORAGE_KEY is populated and
// the flag is set, so every later call is a no-op read, not a repeated
// copy -- an explicit sign-out and then a *different* login in the PWA
// afterward is never overwritten.
function migratePwaSessionOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(PWA_MIGRATION_FLAG)) return;
    window.localStorage.setItem(PWA_MIGRATION_FLAG, "1");

    const alreadyHasPwaSession = window.localStorage.getItem(PWA_STORAGE_KEY);
    if (alreadyHasPwaSession) return;

    const webSession = window.localStorage.getItem(WEB_STORAGE_KEY);
    if (webSession) {
      window.localStorage.setItem(PWA_STORAGE_KEY, webSession);
    }
  } catch {
    // Private-browsing storage quotas, disabled localStorage, etc. --
    // worst case the user just sees the pre-fix "log in again" behavior
    // this session, not a crash.
  }
}

export function createClient() {
  const standalone = isStandalonePwa();
  if (standalone) migratePwaSessionOnce();

  const storageKey = standalone ? PWA_STORAGE_KEY : WEB_STORAGE_KEY;

  return createBrowserClient<Database>(supabaseUrl, supabaseAnon, {
    auth: { storageKey },
  });
}

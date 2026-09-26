/**
 * ARCH-THEME-INIT-CSP-HASH — the inlined theme-init script and its CSP
 * allowance can never silently drift apart.
 *
 * GOLD-FLASH-FIX (2026-09-25): theme-init used to be an external file
 * (public/theme-init.js) loaded via `<Script src="..." strategy=
 * "beforeInteractive">`. Real-world bug report: even a same-origin,
 * beforeInteractive script needs a network fetch to complete before it can
 * run, and the browser can paint :root's default gold CSS variables during
 * that gap — on the boot splash (full-screen, brand-colored, designed to
 * be the very first thing visible) that gap was a real, visible "gold,
 * then the real theme" flash for anyone who'd picked nova/velvet/aurora.
 *
 * Fix: inline THEME_INIT_SCRIPT's text directly into layout.tsx (zero
 * fetch) and allow it via a CSP hash source (THEME_INIT_SCRIPT_CSP_HASH)
 * instead of a nonce, since the content is static. The hash can't be
 * computed at the point it's used — middleware.ts runs on the Edge
 * Runtime, which has no Node `crypto` module — so it's a hand-set literal
 * in theme-init-script.ts. This test is what keeps that literal honest: it
 * runs in Node (Vitest), recomputes the real SHA-256 of THEME_INIT_SCRIPT,
 * and fails if it doesn't match THEME_INIT_SCRIPT_CSP_HASH — so an edit to
 * the script that forgets to update the hash breaks CI instead of shipping
 * a CSP violation that silently blocks the script (and reintroduces the
 * exact flash this whole fix was for) in production.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  THEME_INIT_SCRIPT,
  THEME_INIT_SCRIPT_CSP_HASH,
} from '../lib/theme/theme-init-script';

const ROOT_DIR = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT_DIR, ...parts), 'utf-8');
}

describe('ARCH-THEME-INIT-CSP-HASH — inline theme-init script stays CSP-allowed', () => {
  it("THEME_INIT_SCRIPT_CSP_HASH is the real SHA-256 of THEME_INIT_SCRIPT", () => {
    const digest = createHash('sha256').update(THEME_INIT_SCRIPT, 'utf-8').digest('base64');
    expect(THEME_INIT_SCRIPT_CSP_HASH).toBe(`sha256-${digest}`);
  });

  it('layout.tsx inlines THEME_INIT_SCRIPT rather than loading an external file', () => {
    const layout = read('src', 'app', 'layout.tsx');
    // Strip JSX block comments first — the comment documenting *why* this
    // changed quotes the old `src="/theme-init.js"` code as history, which
    // would otherwise false-fail the negative match below.
    const withoutComments = layout.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(withoutComments).toMatch(/THEME_INIT_SCRIPT/);
    expect(withoutComments).not.toMatch(/src=["']\/theme-init\.js["']/);
  });

  it("middleware.ts's CSP script-src includes THEME_INIT_SCRIPT_CSP_HASH", () => {
    const middleware = read('src', 'middleware.ts');
    expect(middleware).toMatch(/THEME_INIT_SCRIPT_CSP_HASH/);
    expect(middleware).toMatch(/script-src[^`]*\$\{THEME_INIT_SCRIPT_CSP_HASH\}/);
  });

  it('the old external theme-init.js file is gone, not left behind as dead/confusing duplicate source', () => {
    expect(() => read('public', 'theme-init.js')).toThrow();
  });
});

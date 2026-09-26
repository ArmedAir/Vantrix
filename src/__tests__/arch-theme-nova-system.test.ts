/**
 * ARCH-THEME-NOVA-SYSTEM — the toggle is actually wired up
 *
 * The color-variable mechanism is covered by arch-15 (default unchanged)
 * and arch-theme-nova-contrast (ramp is accessible). This file guards the
 * *plumbing* around it: the storage key, the theme list, and that the
 * toggle button is actually mounted somewhere a visitor can reach it, both
 * signed in and signed out.
 *
 * GOLD-FLASH-FIX (2026-09-25): the storage-key-agreement test here used to
 * regex-match public/theme-init.js against constants.ts, because
 * theme-init.js was a plain external script that "can't share an import"
 * with TS (its own then-comment's words). That constraint no longer
 * exists — theme-init is now generated from THEME_STORAGE_KEY directly
 * (src/lib/theme/theme-init-script.ts), inlined into layout.tsx instead of
 * loaded as a separate file, so agreement is now structural rather than
 * something a regex needs to check. See arch-theme-init-csp-hash.test.ts
 * for the plumbing that replaced it (the inline script <-> CSP hash
 * pairing that comes with generating it this way).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { THEME_INIT_SCRIPT } from '../lib/theme/theme-init-script';
import { THEME_STORAGE_KEY } from '../lib/theme/constants';

const ROOT_DIR = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT_DIR, ...parts), 'utf-8');
}

describe('ARCH-THEME-NOVA-SYSTEM — toggle plumbing', () => {
  it('the generated init script actually embeds the real THEME_STORAGE_KEY value', () => {
    // Structural agreement is guaranteed by theme-init-script.ts importing
    // THEME_STORAGE_KEY directly (they can't drift apart at the source) —
    // this instead guards the codegen itself: that the generated script
    // text actually contains the key's real value, not an empty/undefined
    // interpolation from a refactor that broke the import.
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it('constants.ts defines exactly four themes: gold (default), nova, velvet, and aurora', () => {
    const constants = read('src', 'lib', 'theme', 'constants.ts');
    expect(constants).toMatch(/THEMES\s*=\s*\["gold",\s*"nova",\s*"velvet",\s*"aurora"\]/);
    expect(constants).toMatch(/DEFAULT_THEME:\s*ThemeName\s*=\s*"gold"/);
  });

  it('root layout inlines THEME_INIT_SCRIPT and mounts ThemeHydration', () => {
    const layout = read('src', 'app', 'layout.tsx');
    expect(layout).toMatch(/THEME_INIT_SCRIPT/);
    expect(layout).toMatch(/<ThemeHydration\s*\/>/);
  });

  it('the toggle is mounted in the authenticated rail, the signed-out header, and the mobile drawer footer, not the mobile top bar', () => {
    // THEME-TOGGLE REMOVED (see top-bar.tsx's own doc comment): TopBar
    // deliberately dropped it on every breakpoint; Sidebar's footer
    // (desktop, `variant="sidebar"`) and PublicHeader (signed-out) are
    // two of the three places a visitor can reach it. The third is
    // mobile-drawer.tsx's own footer (see top-bar.tsx's
    // MOBILE-THEME-TOGGLE FIX, CORRECTED comment) — signed-in mobile
    // doesn't fall back to Settings' ThemePicker, it has a real toggle
    // of its own; asserting that here too so a future edit that quietly
    // drops it isn't a silent regression the way the original bug was.
    const topBar = read('src', 'components', 'shell', 'top-bar.tsx');
    const sidebar = read('src', 'components', 'shell', 'sidebar.tsx');
    const mobileDrawer = read('src', 'components', 'shell', 'mobile-drawer.tsx');
    const publicHeader = read('src', 'components', 'public', 'public-header.tsx');
    expect(topBar).not.toMatch(/<ThemeToggle/);
    expect(sidebar).toMatch(/<ThemeToggle/);
    expect(mobileDrawer).toMatch(/<ThemeToggle/);
    expect(publicHeader).toMatch(/<ThemeToggle\s*\/>/);
  });

  it('the init script never writes to localStorage (read-only, no side effects before hydration)', () => {
    expect(THEME_INIT_SCRIPT).not.toMatch(/localStorage\.setItem/);
  });
});

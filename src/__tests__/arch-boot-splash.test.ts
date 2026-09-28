/**
 * ARCH-BOOT-SPLASH — the launch animation stays wired up and stays out of
 * the way of regular web visits.
 *
 * The animation itself is CSS; what can silently rot is the plumbing:
 * public/boot-init.js (plain JS, can't import TS) has to agree with
 * boot-splash.tsx / boot-splash.css on the asset and attribute names, the
 * root layout has to load and mount all of it, and the splash has to stay
 * opt-in (installed app / native shell / ?splash=1) so the Lighthouse-
 * audited marketing pages never pay for it.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT_DIR, ...parts), 'utf-8');
}

describe('ARCH-BOOT-SPLASH — launch animation plumbing', () => {
  it('root layout loads boot-init.js beforeInteractive, imports the stylesheet, and mounts <BootSplash />', () => {
    const layout = read('src', 'app', 'layout.tsx');
    expect(layout).toMatch(/src="\/boot-init\.js"\s+strategy="beforeInteractive"/);
    expect(layout).toMatch(/import\s+"\.\/boot-splash\.css"/);
    expect(layout).toMatch(/<BootSplash\s*\/>/);
  });

  it('boot-init.js, boot-splash.tsx and boot-splash.css agree on the data attribute', () => {
    const init = read('public', 'boot-init.js');
    const tsx = read('src', 'components', 'shell', 'boot-splash.tsx');
    const css = read('src', 'app', 'boot-splash.css');

    expect(init).toMatch(/setAttribute\("data-boot",\s*"play"\)/);
    expect(tsx).toMatch(/BOOT_ATTR\s*=\s*"data-boot"/);
    expect(css).toMatch(/html\[data-boot="play"\]\s+\.vx-boot/);
    expect(css).toMatch(/html\[data-boot="out"\]\s+\.vx-boot/);
  });

  it('the heart asset boot-init.js preloads is the one the stylesheet paints, and it exists', () => {
    const init = read('public', 'boot-init.js');
    const css = read('src', 'app', 'boot-splash.css');

    const initUrl = init.match(/HEART_URL\s*=\s*"([^"]+)"/)?.[1];
    expect(initUrl).toBeDefined();
    expect(css).toContain(`url("${initUrl}")`);
    expect(existsSync(join(ROOT_DIR, 'public', initUrl!.replace(/^\//, '')))).toBe(true);
    // /icons/* is served with a 1-year immutable Cache-Control (next.config.js),
    // which is what makes the second launch instant.
    expect(initUrl).toMatch(/^\/icons\//);
  });

  it('is hidden by default and only shown under data-boot, so web visits and crawlers never see it', () => {
    const css = read('src', 'app', 'boot-splash.css');
    expect(css).toMatch(/\.vx-boot\s*\{[^}]*display:\s*none/);
  });

  it('plays only for installed / native / ?splash=1 unless ALWAYS_ON_WEB is deliberately flipped', () => {
    const init = read('public', 'boot-init.js');
    expect(init).toMatch(/ALWAYS_ON_WEB\s*=\s*false/);
    expect(init).toMatch(/display-mode: standalone/);
    expect(init).toMatch(/splash=1/);
  });

  it('uses only theme variables for colour, so Nova / Velvet / Aurora re-tint it for free', () => {
    const css = read('src', 'app', 'boot-splash.css');
    expect(css).toMatch(/var\(--gold-\d+\)/);
    expect(css).toMatch(/var\(--color-base\)/);
    // No stray hex colours — rgb()/rgba() with explicit accents are limited
    // to the fixed heart-art tones (ivory sheen, magenta glow).
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![^{]*\{)/);
  });

  it('has a hard cap so a stalled load can never trap a user behind the splash', () => {
    const tsx = read('src', 'components', 'shell', 'boot-splash.tsx');
    expect(tsx).toMatch(/MAX_MS\s*=\s*\d+/);
    expect(tsx).toMatch(/Promise\.race/);
  });
});

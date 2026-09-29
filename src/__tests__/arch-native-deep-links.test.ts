/**
 * ARCH-NATIVE — Deep-link allowlist stays in sync with the Android manifest
 *
 * src/lib/native/deep-link-paths.ts is the single source of truth for which
 * paths open in-app from a universal/app link. The iOS AASA route imports
 * it directly (see src/app/.well-known/apple-app-site-association/route.ts)
 * so it structurally cannot drift — TypeScript itself guards that side.
 *
 * mobile-capacitor/android/app/src/main/AndroidManifest.xml is a static XML
 * file and can't import TypeScript, so its <intent-filter
 * android:autoVerify="true"> paths are hand-kept in sync instead. This test
 * is what actually enforces that: it fails the build the moment someone
 * adds/removes a path in one place and forgets the other, rather than that
 * surfacing later as "Android app links silently don't open this new
 * route" or "the manifest still claims a route that no longer resolves."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EXACT_PATHS, PATH_PREFIXES } from '../lib/native/deep-link-paths';

const MANIFEST_PATH = join(
  __dirname,
  '../../mobile-capacitor/android/app/src/main/AndroidManifest.xml',
);

function readManifestDataTags(): string[] {
  return readFileSync(MANIFEST_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.includes('<data '));
}

describe('Android manifest deep-link paths match deep-link-paths.ts', () => {
  const dataTags = readManifestDataTags();

  it('has an android:path entry for every EXACT_PATHS entry, and no extras', () => {
    const manifestExact = dataTags
      .map((line) => line.match(/android:path="([^"]+)"/)?.[1])
      .filter((v): v is string => Boolean(v));

    expect(new Set(manifestExact)).toEqual(new Set(EXACT_PATHS));
  });

  it('has an android:pathPrefix entry for every PATH_PREFIXES entry, and no extras', () => {
    const manifestPrefixes = dataTags
      .map((line) => line.match(/android:pathPrefix="([^"]+)"/)?.[1])
      .filter((v): v is string => Boolean(v));

    expect(new Set(manifestPrefixes)).toEqual(new Set(PATH_PREFIXES));
  });

  it('the host allowlist covers both apex and www', () => {
    const manifest = readFileSync(MANIFEST_PATH, 'utf8');
    expect(manifest).toContain('android:host="vantrix.ink"');
    expect(manifest).toContain('android:host="www.vantrix.ink"');
  });
});

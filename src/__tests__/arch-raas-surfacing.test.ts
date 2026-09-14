/**
 * ARCH-RAAS-SURFACING — the RaaS UI is actually mounted, not just built
 *
 * lib/commerce/raas.ts's purchase/pricing/fine-tune functions and their
 * API routes existed for days with nothing in the app ever calling them
 * — the same "buried feature" shape arch-theme-nova-system.test.ts guards
 * against for the theme toggle. This file is that guard for RaaS: each
 * assertion checks a UI entry point is actually imported and rendered on
 * the page a user would land on, not just that the component file exists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT_DIR, ...parts), 'utf-8');
}

describe('ARCH-RAAS-SURFACING — buyer, creator, and public entry points', () => {
  it('the character page mounts the relationship-tier upgrade widget', () => {
    const page = read('src', 'app', '(app)', 'characters', '[id]', 'page.tsx');
    expect(page).toMatch(/import\s*\{\s*CharacterRelationshipTier\s*\}/);
    expect(page).toMatch(/<CharacterRelationshipTier\s+characterId=/);
  });

  it('the upgrade route exposes a GET for status alongside the existing POST', () => {
    const route = read('src', 'app', 'api', 'relationships', '[characterId]', 'upgrade', 'route.ts');
    expect(route).toMatch(/export const GET/);
    expect(route).toMatch(/export const POST/);
  });

  it('the Studio character page mounts pricing + fine-tune management', () => {
    const page = read('src', 'app', '(app)', 'studio', '[id]', 'page.tsx');
    expect(page).toMatch(/import\s*\{\s*RaasPricingCard\s*\}/);
    expect(page).toMatch(/import\s*\{\s*FineTuneManager\s*\}/);
    expect(page).toMatch(/<RaasPricingCard\s+characterId=/);
    expect(page).toMatch(/<FineTuneManager\s+characterId=/);
  });

  it('the fine-tune management routes are owner-scoped (creator/characters/[id])', () => {
    const list = read('src', 'app', 'api', 'creator', 'characters', '[id]', 'fine-tunes', 'route.ts');
    const item = read(
      'src', 'app', 'api', 'creator', 'characters', '[id]', 'fine-tunes', '[fineTuneId]', 'route.ts'
    );
    expect(list).toMatch(/export const GET/);
    expect(list).toMatch(/export const POST/);
    expect(item).toMatch(/export const PATCH/);
    expect(item).toMatch(/export const DELETE/);
  });

  it('the /relationships explainer page exists and covers all three tiers', () => {
    const page = read('src', 'app', '(app)', 'relationships', 'page.tsx');
    expect(page).toMatch(/RELATIONSHIP_TIER_ORDER/);
    const constants = read('src', 'lib', 'commerce', 'raas-constants.ts');
    expect(constants).toMatch(/spark:/);
    expect(constants).toMatch(/bond:/);
    expect(constants).toMatch(/soulbound:/);
  });

  it('/relationships is exempted from the signed-out redirect, allowed in robots.txt, and listed in the sitemap', () => {
    const layout = read('src', 'app', '(app)', 'layout.tsx');
    const robots = read('src', 'app', 'robots.ts');
    const sitemap = read('src', 'app', 'sitemap.ts');

    expect(layout).toMatch(/pathname !== "\/relationships"/);
    expect(robots).toMatch(/"\/relationships"/);
    expect(sitemap).toMatch(/absoluteUrl\("\/relationships"\)/);
  });
});

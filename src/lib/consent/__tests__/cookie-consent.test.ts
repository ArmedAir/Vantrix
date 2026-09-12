import { describe, it, expect } from 'vitest';
import {
  parseConsentCookie,
  serializeConsent,
  hasConsent,
  getStoredConsent,
  CONSENT_VERSION,
} from '../cookie-consent';

describe('consent/cookie-consent', () => {
  describe('parseConsentCookie', () => {
    it('returns null for a missing/empty cookie', () => {
      expect(parseConsentCookie(undefined)).toBeNull();
      expect(parseConsentCookie(null)).toBeNull();
      expect(parseConsentCookie('')).toBeNull();
    });

    it('returns null for malformed JSON rather than throwing', () => {
      expect(parseConsentCookie('not-json')).toBeNull();
    });

    it('round-trips a real consent choice through serialize -> parse', () => {
      const serialized = serializeConsent({ analytics: true, marketing: false });
      const parsed = parseConsentCookie(serialized);
      expect(parsed).toEqual({ essential: true, analytics: true, marketing: false });
    });

    it('treats a stale version as no decision (re-prompts) rather than trusting old categories', () => {
      const stale = encodeURIComponent(
        JSON.stringify({
          essential: true, analytics: true, marketing: true,
          version: CONSENT_VERSION - 1, decidedAt: new Date().toISOString(),
        })
      );
      expect(parseConsentCookie(stale)).toBeNull();
    });

    it('coerces non-boolean analytics/marketing values rather than passing them through', () => {
      const malformed = encodeURIComponent(
        JSON.stringify({ essential: true, analytics: 'yes', marketing: undefined, version: CONSENT_VERSION })
      );
      expect(parseConsentCookie(malformed)).toEqual({ essential: true, analytics: true, marketing: false });
    });
  });

  describe('hasConsent', () => {
    it('essential is always true, independent of any stored cookie', () => {
      expect(hasConsent('essential')).toBe(true);
    });

    it('analytics/marketing are false with no stored decision (fail closed, not fail open)', () => {
      // No `document` in this suite's node test environment, so
      // getStoredConsent() returns null here the same way it would for a
      // first-time visitor who hasn't decided yet — the case this test
      // is actually protecting: no tracker should assume consent by
      // default.
      expect(getStoredConsent()).toBeNull();
      expect(hasConsent('analytics')).toBe(false);
      expect(hasConsent('marketing')).toBe(false);
    });
  });
});

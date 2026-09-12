ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS voice_notes JSONB;

COMMENT ON COLUMN characters.voice_notes IS
  'Creator-facing free-text voice description (pace/pitch as prose, catchphrase) from the Voice Builder UI. Distinct from voice_profile, which is the numeric TTS-engine shape consumed by /api/voice/tts — do not conflate the two.';

COMMENT ON COLUMN characters.voice_profile IS
  'Numeric TTS-engine voice shape: { pitch: number, pace: number, warmth: number, pauses: string, energy: number }. Set by digital-person-bootstrap.ts at creation or restored on import. NOT for creator-facing free-text — see voice_notes.';


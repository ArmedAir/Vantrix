/**
 * GET /api/share/[id]/og — Viral Share Card OG Image
 *
 * Generates a 1200×630 Open Graph image for each share card type.
 * Used by social platforms (Twitter, Instagram, WhatsApp) to render
 * link previews when a Vantrix share URL is posted.
 *
 * Rendered via next/og (Satori) — Edge Runtime compatible.
 * Each card type has a purpose-built layout:
 * milestone — achievement ceremony card
 * relationship — bond score + character name
 * compatibility — percentage score
 * memory — "a moment to remember"
 *
 * Also fires a non-blocking trackCardView() for analytics.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { bg } from '@/lib/logger';
import { trackCardView } from '@/lib/growth/viral-share';
import { absoluteUrl } from '@/lib/utils';

export const runtime = 'nodejs';

// Map milestone keys and card types to their emoji
//
// EMOJI-RESTORE FIX: every value in this map had been reduced to an empty
// string (still keyed correctly, just no glyph), so the "Primary emoji"
// block below always rendered a blank space where a glyph should be — one
// of the two things making these cards look like broken/placeholder art
// (the other, fixed below, is that the real character photo was never
// rendered here at all).
const MILESTONE_EMOJI: Record<string, string> = {
 first_chat: '\u{1F4AC}',
 first_week: '\u{1F4C5}',
 first_month: '\u{1F5D3}\u{FE0F}',
 three_months: '\u{1F389}',
 first_gift: '\u{1F381}',
 soulmate: '\u{1F49E}',
 relationship: '\u{1F49B}',
 compatibility: '\u{1F9E9}',
 deep_talk: '\u{1F319}',
 week_streak: '\u{1F525}',
 memory: '\u{2728}',
};

const CARD_BACKGROUNDS: Record<string, string> = {
 milestone: '#1a0a2e',
 relationship: '#1a0028',
 compatibility: '#0a1a2e',
 memory: '#1a1a0a',
};

export async function GET(
 _req: NextRequest,
 context: { params: Promise<{ id: string }> },
) {
 const { id } = (await context.params);

 const { data: card } = await supabaseAdmin
 .from('share_cards')
 .select('card_type, data')
 .eq('id', id)
 .single();

 if (!card) {
 return new Response('Card not found', { status: 404 });
 }

 // Track view — non-blocking, never fails the image render
 trackCardView(id).catch(bg('trackCardView'));

 const d = card.data as Record<string, unknown>;
 const cardType = card.card_type as string;

 // Resolve emoji and headline from card data
 const emoji: string = MILESTONE_EMOJI[cardType]
 ?? MILESTONE_EMOJI[(d.milestoneKey as string) ?? '']
 ?? '';

 const headline: string =
 cardType === 'milestone'
 ? String(d.milestoneLabel ?? 'Achievement Unlocked')
 : cardType === 'relationship'
 ? `Bond: ${String(d.bondScore ?? 0)}/100 with ${String(d.characterName ?? 'her')}`
 : cardType === 'compatibility'
 ? `${String(d.compatibility ?? '—')}% Compatible`
 : 'A moment to remember';

 const background = CARD_BACKGROUNDS[cardType] ?? CARD_BACKGROUNDS.milestone;

 // REAL-PHOTO FIX: viral-share.ts has always captured a real
 // `characterImage` on every card (see createRelationshipCard/
 // createMilestoneCard's matchData/milestone params) and stored it in this
 // row's `data` column, but this route never read it — every card rendered
 // as an emoji-on-solid-color card with no actual character photo, which
 // is not what a "meet this character" growth card should look like.
 //
 // Two things make embedding it here non-trivial, both handled below:
 //   1. resolveImageSrc() (lib/utils.ts), which produced this value
 //      client-side, commonly returns an origin-relative path like
 //      "/images/characters/yanefes.jpg" (see the real seeded character
 //      rows) rather than an absolute URL — Satori/next-og has no browser
 //      "current origin" to resolve that against, so it must be made
 //      absolute first (absoluteUrl(), the same helper already used by
 //      this card's own page.tsx sibling).
 //   2. Satori fetches the <img> src as part of the streamed render, not
 //      up front — a bad/unreachable URL would fail *after* this route
 //      has already committed to a 200 response, which is exactly the
 //      failure mode that was showing site visitors a generic broken-
 //      image icon (next/image's onError -> CHARACTER_IMAGE_FALLBACK)
 //      instead of a real card. So the photo is fetched and validated
 //      *here*, synchronously, before the tree is built — the render
 //      degrades to the emoji-only layout instead of ever depending on
 //      an unresolved image fetch.
 const rawCharacterImage =
 typeof d.characterImage === 'string' && d.characterImage.trim().length > 0
 ? d.characterImage
 : null;

 let photoDataUrl: string | null = null;
 if (rawCharacterImage) {
 try {
 const absoluteImageUrl = rawCharacterImage.startsWith('/')
 ? absoluteUrl(rawCharacterImage)
 : rawCharacterImage;
 const imgRes = await fetch(absoluteImageUrl, { signal: AbortSignal.timeout(4000) });
 if (imgRes.ok) {
 const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
 const bytes = Buffer.from(await imgRes.arrayBuffer());
 photoDataUrl = `data:${contentType};base64,${bytes.toString('base64')}`;
 }
 } catch (err) {
 // Never let a bad/unreachable photo URL take down the whole card —
 // fall through to the emoji-only layout below.
 bg('share-og.photoFetch')(err);
 }
 }

 return new ImageResponse(
 (
 <div
 style={{
 background,
 width: '100%',
 height: '100%',
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 justifyContent: 'center',
 fontFamily: 'system-ui, -apple-system, sans-serif',
 color: 'white',
 padding: '60px',
 }}
 >
 {/* Brand wordmark */}
 <div
 style={{
 color: '#8E8E97',
 fontSize: 16,
 marginBottom: 32,
 letterSpacing: 6,
 textTransform: 'uppercase',
 fontWeight: 600,
 }}
 >
 VANTRIX
 </div>

 {/* Character photo when resolved, emoji as the safe fallback */}
 {photoDataUrl ? (
 <div
 style={{
 display: 'flex',
 width: 168,
 height: 168,
 borderRadius: '50%',
 marginBottom: 24,
 border: '3px solid rgba(236,72,153,0.6)',
 overflow: 'hidden',
 }}
 >
 {/* eslint-disable-next-line @next/next/no-img-element -- Satori/next-og renders its own <img>, not next/image */}
 <img
 src={photoDataUrl}
 alt="Companion avatar"
 width={168}
 height={168}
 style={{ objectFit: 'cover', width: '100%', height: '100%' }}
 />
 </div>
 ) : (
 <div style={{ fontSize: 80, marginBottom: 20 }}>{emoji}</div>
 )}

 {/* Headline */}
 <div
 style={{
 fontSize: 36,
 fontWeight: 700,
 marginBottom: 10,
 textAlign: 'center',
 maxWidth: 800,
 lineHeight: 1.3,
 }}
 >
 {headline}
 </div>

 {/* Character name (when relevant) */}
 {Boolean(d.characterName) && cardType !== 'relationship' && (
 <div
 style={{
 color: 'rgba(255,255,255,0.5)',
 fontSize: 20,
 marginBottom: 48,
 }}
 >
 with {String(d.characterName)}
 </div>
 )}

 {/* Stats row */}
 <div style={{ display: 'flex', gap: 56, marginTop: 12 }}>
 {typeof d.bondScore === 'number' && (
 <div style={{ textAlign: 'center' }}>
 <div style={{ color: '#8E8E97', fontSize: 40, fontWeight: 700 }}>
 {d.bondScore}
 </div>
 <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
 Bond Score
 </div>
 </div>
 )}

 {typeof d.streakDays === 'number' && d.streakDays > 0 && (
 <div style={{ textAlign: 'center' }}>
 <div style={{ color: '#f97316', fontSize: 40, fontWeight: 700 }}>
 {d.streakDays}
 </div>
 <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
 Day Streak 
 </div>
 </div>
 )}

 {typeof d.compatibility === 'number' && cardType === 'compatibility' && (
 <div style={{ textAlign: 'center' }}>
 <div style={{ color: '#22c55e', fontSize: 40, fontWeight: 700 }}>
 {d.compatibility}%
 </div>
 <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
 Compatible
 </div>
 </div>
 )}
 </div>

 {/* Milestone label (extra line for milestone cards) */}
 {cardType === 'milestone' && Boolean(d.milestoneKey) && (
 <div
 style={{
 marginTop: 40,
 padding: '10px 28px',
 border: '1px solid rgba(124,58,237,0.4)',
 borderRadius: 40,
 color: 'rgba(124,58,237,0.9)',
 fontSize: 14,
 letterSpacing: 2,
 }}
 >
 {String(d.milestoneKey).replace(/_/g, ' ').toUpperCase()}
 </div>
 )}

 {/* Footer */}
 <div
 style={{
 color: 'rgba(255,255,255,0.2)',
 fontSize: 13,
 marginTop: 56,
 letterSpacing: 1,
 }}
 >
 vantrix.ink — AI Relationships
 </div>
 </div>
 ),
 { width: 1200, height: 630 },
 );
}

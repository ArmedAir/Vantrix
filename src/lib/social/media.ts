// src/lib/social/media.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetches a character portrait (or any character_posts.image_url) and
// compresses/resizes it with sharp — already a listed dependency
// (package.json), just not previously wired to anything — so uploadMedia()
// in x-client.ts never has to deal with an oversized or wrong-format source
// image. X's v1.1 chunked upload accepts images well past this size, but
// keeping cross-posted images small and consistently JPEG:
//   - keeps the publisher's per-post upload fast and cheap on bandwidth
//   - avoids depending on whatever format the image pipeline happened to
//     generate the portrait in (webp/png/etc.)
// ─────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { sanitizeProviderError } from '@/lib/security';

// Hard ceiling on the source download before it's even decoded — same
// bounded-buffer-with-cap shape as uploadUrlToR2 (lib/storage/r2.ts).
// Portraits are a few hundred KB to a couple MB in practice; 20MB is
// generous headroom while still bounding worst-case memory use.
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

// Output target: X displays timeline images well under 2048px on the long
// edge regardless of source resolution, and re-encodes anyway — sending a
// smaller, already-compressed JPEG means a faster APPEND phase (fewer
// chunks) with no visible quality loss on the platform that will
// re-process it either way.
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 85;

export class MediaFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaFetchError';
  }
}

/** Bounded-size fetch of a remote image URL into a Buffer — same cap/timeout pattern as uploadUrlToR2. */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new MediaFetchError(`media: fetch failed: ${sanitizeProviderError(err)}`);
  }

  if (!res.ok) {
    throw new MediaFetchError(`media: fetch failed (${res.status}) for ${url}`);
  }

  const declaredLength = Number(res.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new MediaFetchError(`media: source image too large (${declaredLength} bytes)`);
  }

  if (!res.body) {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new MediaFetchError(`media: source image too large (${buffer.byteLength} bytes)`);
    }
    return buffer;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw new MediaFetchError(`media: source image too large (${total}+ bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export interface PreparedMedia {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Fetches `imageUrl` and re-encodes it to a size-capped JPEG ready for
 * `uploadMedia()` in x-client.ts. Downscales only — never upscales a
 * smaller source past its own dimensions (`withoutEnlargement: true`).
 */
export async function prepareCharacterImageForX(imageUrl: string): Promise<PreparedMedia> {
  const source = await fetchImageBuffer(imageUrl);

  try {
    const pipeline = sharp(source)
      .rotate() // auto-orient from EXIF before resizing, then strips EXIF on output
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const buffer = await pipeline.toBuffer();
    const meta = await sharp(buffer).metadata();

    return {
      buffer,
      mimeType: 'image/jpeg',
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch (err) {
    logger.warn('[x-media] compression failed', { imageUrl, error: sanitizeProviderError(err) });
    throw new MediaFetchError(`media: compression failed: ${sanitizeProviderError(err)}`);
  }
}

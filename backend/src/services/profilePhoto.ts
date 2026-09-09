import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DomainError } from './DomainError.js';

export const PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;
const PHOTO_BYTES = 64 * 1024;
const PREFIX = 'data:image/jpeg;base64,';

/** Only our bounded, re-encoded JPEGs enter the Profile row. Original bytes are discarded. */
export async function encodeProfilePhoto(input: Buffer, contentType: string): Promise<string> {
  const format = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    ? 'jpeg'
    : input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : null;
  if (
    !input.length ||
    input.length > PHOTO_UPLOAD_BYTES ||
    !format ||
    contentType !== `image/${format}`
  )
    throw new DomainError('validation_error', 'Choose a JPEG, PNG or WebP photo up to 5 MB.');
  try {
    const image = sharp(input, { limitInputPixels: 4096 * 4096, failOn: 'warning' });
    const meta = await image.metadata();
    if (
      meta.format !== format ||
      !meta.width ||
      !meta.height ||
      meta.width > 4096 ||
      meta.height > 4096 ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error('Unsupported dimensions or animation');
    const jpeg = await image
      .rotate()
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#FFF4E8' })
      .jpeg({ quality: 80 })
      .timeout({ seconds: 3 })
      .toBuffer();
    if (jpeg.length > PHOTO_BYTES) throw new Error('Output too large');
    return PREFIX + jpeg.toString('base64');
  } catch {
    throw new DomainError(
      'validation_error',
      'This photo could not be read. Choose a still JPEG, PNG or WebP no larger than 4096 × 4096 pixels.'
    );
  }
}

export function ownedPhotoBytes(value: string | null): Buffer | null {
  if (!value?.startsWith(PREFIX) || value.length > PREFIX.length + Math.ceil(PHOTO_BYTES / 3) * 4)
    return null;
  const encoded = value.slice(PREFIX.length);
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length && bytes.length <= PHOTO_BYTES && bytes.toString('base64') === encoded
    ? bytes
    : null;
}

export function photoVersion(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The only outward mapping: app-owned image bytes never enter a Profile DTO or Session. */
export function profileAvatarUrl(id: string, value: string | null): string | null {
  const bytes = ownedPhotoBytes(value);
  if (bytes) return `/api/profile-photos/${id}/${photoVersion(bytes)}.jpg`;
  // Legacy Google URLs are displayed by the browser, never fetched by the server.
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048
      ? url.href
      : null;
  } catch {
    return null;
  }
}

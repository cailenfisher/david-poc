import { imageSize } from 'image-size';
import type { MediaLicense } from '@sveltebuilder/content';

// Same list as the `media` bucket (supabase/supplemental/09-media-storage.sql).
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

// Under Vercel's 4.5 MB function request body cap, and equal to the bucket's file size limit.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// image-size reports the format by file extension, not by MIME type.
const MIME_TYPE_BY_DETECTED_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

const MEDIA_LICENSES: readonly MediaLicense[] = [
  'all_rights_reserved',
  'rights_managed',
  'royalty_free',
  'creative_commons',
  'public_domain',
];

/**
 * `media/<yyyy>/<mm>/<uuid>.<extension>`. The first segment is the bucket name, because the
 * public URL is `<storage base>/<storage_key>`. Not tied to an article, since assets are
 * reused, and never built from the original filename, which can leak a path and collide.
 */
export function buildStorageKey(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error(`Unsupported image type: ${mimeType}`);

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/** Reads the header only. Throws on unreadable input. */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } {
  const size = imageSize(bytes);
  if (!size.width || !size.height) throw new Error('Image dimensions are unreadable.');
  return { width: size.width, height: size.height };
}

/**
 * The MIME type the file's own bytes say it is, or null when they are not a supported image.
 * Compared against `file.type` by the caller, so a renamed `.exe` fails both ways.
 */
export function detectImageMimeType(bytes: Uint8Array): string | null {
  try {
    const detected = imageSize(bytes).type;
    return (detected && MIME_TYPE_BY_DETECTED_TYPE[detected]) || null;
  } catch {
    return null;
  }
}

export interface RightsFields {
  license: MediaLicense;
  creditRequired: boolean;
  expiresAt: string | null;
  sourceUrl: string;
  licenseUrl: string | null;
  retrievedAt: string;
}

export type ParsedRights =
  | { rights: RightsFields; error?: undefined }
  | { rights?: undefined; error: string; field: string };

/** Shared by the upload and the rights edit. */
export function parseRightsFields(form: FormData): ParsedRights {
  const license = String(form.get('license') ?? '');
  if (!MEDIA_LICENSES.includes(license as MediaLicense)) {
    return { field: 'license', error: 'Choose a license.' };
  }

  const sourceUrl = String(form.get('source_url') ?? '').trim();
  if (!isHttpUrl(sourceUrl)) {
    return { field: 'source_url', error: 'The source must be a web address starting with http or https.' };
  }

  const licenseUrl = String(form.get('license_url') ?? '').trim();
  if (licenseUrl && !isHttpUrl(licenseUrl)) {
    return { field: 'license_url', error: 'The license link must start with http or https.' };
  }
  // Different CC licenses have different terms, so the exact one has to be on record.
  if (license === 'creative_commons' && !licenseUrl) {
    return { field: 'license_url', error: 'A Creative Commons license needs a link to the exact license.' };
  }

  const expiresRaw = String(form.get('expires_at') ?? '').trim();
  let expiresAt: string | null = null;
  if (expiresRaw) {
    const expires = new Date(expiresRaw);
    if (Number.isNaN(expires.getTime())) {
      return { field: 'expires_at', error: 'The expiry date is not valid.' };
    }
    expiresAt = expires.toISOString();
  }

  const retrievedRaw = String(form.get('retrieved_at') ?? '').trim();
  const retrieved = retrievedRaw ? new Date(retrievedRaw) : new Date();
  if (Number.isNaN(retrieved.getTime())) {
    return { field: 'retrieved_at', error: 'The date the license was checked is not valid.' };
  }

  return {
    rights: {
      license: license as MediaLicense,
      creditRequired: form.get('credit_required') === 'true',
      expiresAt,
      sourceUrl,
      licenseUrl: licenseUrl || null,
      retrievedAt: retrieved.toISOString(),
    },
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

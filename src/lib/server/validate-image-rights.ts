import type { DictionaryInstance } from 'diglossia';
import type { ArticleBlock } from '@sveltebuilder/content';
import type { MediaAssetWithRights } from '$lib/types/media-asset';

/**
 * What stops an image being published, beyond the alt text the content module already checks.
 * Returns human-readable problems, empty when the article is fine, so the editor sees every one
 * at once. Pure, like the module's own validators.
 *
 * `localeCode` is the locale being published. A credit that exists only as the fallback
 * locale's text does not count: a French page must not go out crediting in English, or with no
 * credit at all once the fallback changes.
 */
export function validateImageRights(
  blocks: Pick<ArticleBlock, 'id' | 'blockType' | 'position' | 'mediaAssetId'>[],
  assets: MediaAssetWithRights[],
  dictionary: DictionaryInstance,
  localeCode: string,
  now: Date = new Date()
): string[] {
  const problems: string[] = [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  for (const block of blocks) {
    if (block.blockType !== 'image') continue;
    const label = `Image block ${block.position}`;

    // The module validator skips these silently; an image block holding nothing is a bug.
    if (block.mediaAssetId === null) {
      problems.push(`${label}: no image is attached.`);
      continue;
    }

    const asset = assetById.get(block.mediaAssetId);
    const rights = asset?.rights ?? null;
    const source = asset?.source ?? null;

    if (rights === null) {
      problems.push(`${label}: no license is recorded, so the image cannot be published.`);
    }

    if (source === null || !source.sourceUrl.trim()) {
      problems.push(`${label}: the source of the image is not recorded.`);
    }

    if (rights === null) continue;

    if (rights.license === 'creative_commons') {
      if (!source?.licenseUrl?.trim()) {
        problems.push(`${label}: a Creative Commons image needs a link to its exact license.`);
      }
      // Every CC license except CC0 requires attribution, and CC0 is recorded as public_domain.
      if (!rights.creditRequired) {
        problems.push(
          `${label}: Creative Commons licenses require credit, but this image is marked as not needing one. Fix the rights record.`
        );
      }
    }

    if (rights.expiresAt !== null && new Date(rights.expiresAt) < now) {
      problems.push(`${label}: license expired on ${rights.expiresAt.slice(0, 10)}.`);
    }

    if (rights.creditRequired || rights.license === 'creative_commons') {
      const credit = dictionary.localText('credit', 'media_asset', block.mediaAssetId);
      const creditLocale = dictionary.localeOf('credit', 'media_asset', block.mediaAssetId);
      if (!credit?.trim() || credit.startsWith('[missing:') || creditLocale !== localeCode) {
        problems.push(`${label}: a credit is required but none is written in this language.`);
      }
    }
  }

  return problems;
}

import type { MediaAsset, MediaAssetRights } from '@sveltebuilder/content';

/** Where an image came from and under exactly which license. Admin only. */
export interface MediaAssetSource {
  id: number;
  mediaAssetId: number;
  sourceUrl: string;
  licenseUrl: string | null;
  retrievedAt: string;
  createdAt: string;
}

/** An asset with its licensing evidence, for the editor. */
export type MediaAssetWithRights = MediaAsset & {
  rights: MediaAssetRights | null;
  source: MediaAssetSource | null;
};

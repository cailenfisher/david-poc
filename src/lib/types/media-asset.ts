import type { MediaAsset, MediaAssetRights, MediaAssetSource } from '@sveltebuilder/content';

/** An asset with its licensing evidence, for the editor. */
export type MediaAssetWithRights = MediaAsset & {
  rights: MediaAssetRights | null;
  source: MediaAssetSource | null;
};

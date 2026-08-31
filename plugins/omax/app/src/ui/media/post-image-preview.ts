import sharpModule from "sharp";
import type { ExpandedTweet, TweetMedia } from "../../types.js";
import type { ImagePreviewData } from "../components/image-preview.js";
import { fetchImageBuffer, isAllowedImageUrl } from "./image-fetch.js";

const DEFAULT_MAX_WIDTH = 40;
const DEFAULT_MAX_HEIGHT = 12;
const CELL_ASPECT_RATIO = 0.5;
const MAX_INPUT_PIXELS = 40_000_000;

const previewCache = new Map<string, Promise<ImagePreviewData | undefined>>();
const inlineImageCache = new Map<string, Promise<InlineImageData | undefined>>();
const PREVIEW_CACHE_LIMIT = 128;
const INLINE_CACHE_LIMIT = 256;

function setBounded<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (!cache.has(key) && cache.size >= limit) {
    const oldest = cache.keys().next().value as K | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function decodeImage(input: Buffer) {
  return sharpModule(input, { limitInputPixels: MAX_INPUT_PIXELS });
}

interface ImagePreviewOptions {
  maxWidth?: number;
  maxHeight?: number;
}

interface InlineImageOptions {
  maxWidthPx: number;
  maxHeightPx: number;
}

export interface InlineImageData {
  cacheKey: string;
  width: number;
  height: number;
  pngData: Buffer;
}

function fitPreviewSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const adjustedHeight = safeSourceHeight * CELL_ASPECT_RATIO;

  const scale = Math.min(maxWidth / safeSourceWidth, maxHeight / adjustedHeight, 1);

  return {
    width: Math.max(1, Math.round(safeSourceWidth * scale)),
    height: Math.max(1, Math.round(safeSourceHeight * scale * CELL_ASPECT_RATIO)),
  };
}

function fitBoundingSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.min(maxWidth / safeSourceWidth, maxHeight / safeSourceHeight, 1);

  return {
    width: Math.max(1, Math.round(safeSourceWidth * scale)),
    height: Math.max(1, Math.round(safeSourceHeight * scale)),
  };
}

function normalizePreviewOptions(options: ImagePreviewOptions = {}): Required<ImagePreviewOptions> {
  return {
    maxWidth: Math.max(4, options.maxWidth ?? DEFAULT_MAX_WIDTH),
    maxHeight: Math.max(2, options.maxHeight ?? DEFAULT_MAX_HEIGHT),
  };
}

function normalizeInlineOptions(options: InlineImageOptions): InlineImageOptions {
  return {
    maxWidthPx: Math.max(16, Math.round(options.maxWidthPx)),
    maxHeightPx: Math.max(16, Math.round(options.maxHeightPx)),
  };
}

function getPostPrimaryMedia(post: ExpandedTweet): TweetMedia | undefined {
  const media = post.media ?? [];

  const photo = media.find((item) => item.type === "photo" && (item.url || item.previewUrl));
  if (photo) {
    return photo;
  }

  const previewableMedia = media.find((item) => item.previewUrl || item.url);
  return previewableMedia;
}

export function getPostPrimaryImageUrl(post: ExpandedTweet): string | undefined {
  const media = getPostPrimaryMedia(post);
  return media?.url ?? media?.previewUrl;
}

export function getPostPrimaryImageDimensions(
  post: ExpandedTweet,
): { width: number; height: number } | undefined {
  const media = getPostPrimaryMedia(post);
  if (!media?.width || !media?.height) {
    return undefined;
  }
  if (media.width <= 0 || media.height <= 0) {
    return undefined;
  }
  return { width: media.width, height: media.height };
}

export async function getImagePreview(
  imageUrl: string,
  options: ImagePreviewOptions = {},
): Promise<ImagePreviewData | undefined> {
  const normalized = normalizePreviewOptions(options);
  const cacheKey = `${imageUrl}::${normalized.maxWidth}x${normalized.maxHeight}`;

  const cached = previewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async (): Promise<ImagePreviewData | undefined> => {
    try {
      if (!isAllowedImageUrl(imageUrl)) {
        return undefined;
      }
      const buf = await fetchImageBuffer(imageUrl);
      const meta = await decodeImage(buf).metadata();
      const target = fitPreviewSize(meta.width ?? 48, meta.height ?? 48, normalized.maxWidth, normalized.maxHeight);

      const { data, info } = await decodeImage(buf)
        .resize(target.width, target.height, { fit: "inside" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        width: info.width,
        height: info.height,
        pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      };
    } catch {
      previewCache.delete(cacheKey);
      return undefined;
    }
  })();

  setBounded(previewCache, cacheKey, pending, PREVIEW_CACHE_LIMIT);
  return pending;
}

export async function getInlineImageData(
  imageUrl: string,
  options: InlineImageOptions,
): Promise<InlineImageData | undefined> {
  const normalized = normalizeInlineOptions(options);
  const cacheKey = `${imageUrl}::inline::${normalized.maxWidthPx}x${normalized.maxHeightPx}`;
  const cached = inlineImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async (): Promise<InlineImageData | undefined> => {
    try {
      if (!isAllowedImageUrl(imageUrl)) {
        return undefined;
      }
      const buf = await fetchImageBuffer(imageUrl);
      const meta = await decodeImage(buf).metadata();
      const target = fitBoundingSize(
        meta.width ?? 48,
        meta.height ?? 48,
        normalized.maxWidthPx,
        normalized.maxHeightPx,
      );

      const pngData = await decodeImage(buf)
        .resize(target.width, target.height, { fit: "inside" })
        .png()
        .toBuffer();

      return {
        cacheKey: `${imageUrl}::${target.width}x${target.height}`,
        width: target.width,
        height: target.height,
        pngData,
      };
    } catch (error) {
      inlineImageCache.delete(cacheKey);
      throw error;
    }
  })();

  setBounded(inlineImageCache, cacheKey, pending, INLINE_CACHE_LIMIT);
  return pending;
}

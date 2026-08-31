export interface TwitterUserImageSource {
  legacy?: {
    profile_image_url_https?: string;
  };
  avatar?: {
    image_url?: string;
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** X currently emits profile photos in two user shapes. Keep that drift at
 * one boundary so timelines, profiles, lists, and search cannot disagree. */
export function extractProfileImageUrl(source: TwitterUserImageSource | undefined): string | undefined {
  return nonEmpty(source?.legacy?.profile_image_url_https) ?? nonEmpty(source?.avatar?.image_url);
}

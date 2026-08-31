import { resolveCredentials, type CookieSource, type TwitterCookies } from "./lib/x-client/index.js";
import { discoverProfiles, describeProfile, resolveKeyringPassword, type BrowserProfile } from "./browsers.js";

export interface ResolvedSession {
  cookies: TwitterCookies;
  profile?: BrowserProfile;
}

/**
 * Read the X session out of one specific browser profile.
 *
 * The cookie library takes an explicit cookie-DB path through `chromeProfile`,
 * which is how omaX reaches Chromium/Brave/Vivaldi and not just Google Chrome.
 * For v11 cookies it needs that build's Safe Storage password, supplied here
 * through the library's documented env override — in-process only, never
 * logged, and scoped to this call.
 */
export async function resolveCookiesForProfile(profile: BrowserProfile): Promise<TwitterCookies> {
  const previous = process.env.SWEET_COOKIE_CHROME_SAFE_STORAGE_PASSWORD;
  if (profile.family === "chromium" && profile.keyringApp && profile.safeStorageLabel) {
    const password = resolveKeyringPassword(profile.keyringApp, profile.safeStorageLabel);
    if (password !== undefined) {
      process.env.SWEET_COOKIE_CHROME_SAFE_STORAGE_PASSWORD = password;
    }
  }

  try {
    const result = await resolveCredentials(
      profile.family === "firefox"
        ? { cookieSource: "firefox", firefoxProfile: profile.cookieDbPath }
        : profile.family === "safari"
          ? { cookieSource: "safari" }
          : { cookieSource: "chrome", chromeProfile: profile.cookieDbPath },
    );
    return result.cookies;
  } finally {
    if (previous === undefined) {
      delete process.env.SWEET_COOKIE_CHROME_SAFE_STORAGE_PASSWORD;
    } else {
      process.env.SWEET_COOKIE_CHROME_SAFE_STORAGE_PASSWORD = previous;
    }
  }
}

function isComplete(cookies: TwitterCookies): boolean {
  return Boolean(cookies.authToken && cookies.ct0);
}

/**
 * Find a logged-in X session, most recently used browser first. Explicit
 * credentials in the environment still win, as before.
 */
export async function resolveSession(opts?: {
  cookieSource?: CookieSource;
  chromeProfile?: string;
  profile?: BrowserProfile;
}): Promise<ResolvedSession> {
  if (opts?.profile) {
    const cookies = await resolveCookiesForProfile(opts.profile);
    if (!isComplete(cookies)) {
      throw new Error(
        `No X session found in ${describeProfile(opts.profile)}. Log into x.com there first.`,
      );
    }
    return { cookies, profile: opts.profile };
  }

  // Explicit source/profile, or env/CLI credentials, keep the upstream path.
  if (opts?.cookieSource || opts?.chromeProfile) {
    const result = await resolveCredentials({
      ...(opts.cookieSource ? { cookieSource: opts.cookieSource } : {}),
      ...(opts.chromeProfile ? { chromeProfile: opts.chromeProfile } : {}),
    });
    if (isComplete(result.cookies)) return { cookies: result.cookies };
    throw new Error("No X session cookies found for the requested browser profile.");
  }

  // An empty source list means "environment and CLI credentials only".
  const envOnly = await resolveCredentials({ cookieSource: [] });
  if (isComplete(envOnly.cookies)) return { cookies: envOnly.cookies };

  const profiles = discoverProfiles();
  for (const profile of profiles) {
    try {
      const cookies = await resolveCookiesForProfile(profile);
      if (isComplete(cookies)) return { cookies, profile };
    } catch {
      // Locked DB or unreadable profile: try the next one.
    }
  }

  throw new Error(
    profiles.length === 0
      ? "No browser profiles found. Log into x.com in Chromium, Chrome, Brave, or Firefox first."
      : `No X session found in ${profiles.length} browser profile(s). Log into x.com in one of them first.`,
  );
}

/** Back-compat helper for callers that only need the cookies. */
export async function resolveCookies(opts?: {
  cookieSource?: CookieSource;
  chromeProfile?: string;
}): Promise<TwitterCookies> {
  const { cookies } = await resolveSession(opts);
  return cookies;
}

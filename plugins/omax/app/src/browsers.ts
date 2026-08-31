/**
 * Browser session discovery for omaX.
 *
 * Upstream offered a fixed macOS-shaped list (Safari, "Chrome Profile 2",
 * "Chrome Profile 3") and only ever scanned Google Chrome's own directory.
 * This module instead finds what is actually installed on the machine —
 * every Chromium build, Firefox and its forks, native / Flatpak / Snap
 * layouts, on Linux, macOS and Windows — and names each profile the way its
 * browser does.
 *
 * It also fixes v11 cookie decryption on Linux. Modern Chromium stores its
 * Safe Storage password in libsecret under
 * `xdg:schema chrome_libsecret_os_crypt_password_v2` plus an `application`
 * attribute, and each build (chrome, chromium, brave…) has its OWN password.
 * The vendored cookie library only probes the legacy
 * `service "Chrome Safe Storage" / account "Chrome"` pair, which misses on
 * current installs — so cookies decrypt to nothing and auto-detect silently
 * reports no session.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type BrowserFamily = "chromium" | "firefox" | "safari";
export type Platform = "linux" | "darwin" | "win32";

/**
 * Where a browser keeps its profiles.
 *
 * `base` directories are resolved against the platform's application-data
 * root; `home` directories are resolved against the user's home directory
 * (Flatpak and Snap sandboxes, and Firefox's dot-directories).
 */
interface Roots {
  base?: string[];
  home?: string[];
}

export interface ChromiumBrowserDef {
  id: string;
  label: string;
  /** libsecret `application` attribute for the Safe Storage password (Linux). */
  keyringApp: string;
  /** "<safeStorageLabel> Safe Storage" — legacy libsecret entry and macOS Keychain service. */
  safeStorageLabel: string;
  roots: Partial<Record<Platform, Roots>>;
}

/**
 * Chromium builds worth looking for. Linux `base` paths are relative to
 * $XDG_CONFIG_HOME, macOS to ~/Library/Application Support, Windows to
 * %LOCALAPPDATA%; `home` paths cover Flatpak and Snap sandboxes.
 */
export const CHROMIUM_BROWSERS: readonly ChromiumBrowserDef[] = [
  {
    id: "chromium", label: "Chromium", keyringApp: "chromium", safeStorageLabel: "Chromium",
    roots: {
      linux: {
        base: ["chromium", "chromium-dev"],
        home: [".var/app/org.chromium.Chromium/config/chromium", "snap/chromium/common/chromium"],
      },
      darwin: { base: ["Chromium"] },
      win32: { base: ["Chromium/User Data"] },
    },
  },
  {
    id: "chrome", label: "Google Chrome", keyringApp: "chrome", safeStorageLabel: "Chrome",
    roots: {
      linux: {
        base: ["google-chrome", "google-chrome-beta", "google-chrome-unstable"],
        home: [".var/app/com.google.Chrome/config/google-chrome"],
      },
      darwin: { base: ["Google/Chrome", "Google/Chrome Beta"] },
      win32: { base: ["Google/Chrome/User Data", "Google/Chrome Beta/User Data"] },
    },
  },
  {
    id: "brave", label: "Brave", keyringApp: "brave", safeStorageLabel: "Brave",
    roots: {
      linux: {
        base: ["BraveSoftware/Brave-Browser", "BraveSoftware/Brave-Browser-Beta"],
        home: [".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser"],
      },
      darwin: { base: ["BraveSoftware/Brave-Browser"] },
      win32: { base: ["BraveSoftware/Brave-Browser/User Data"] },
    },
  },
  {
    id: "edge", label: "Microsoft Edge", keyringApp: "microsoft-edge", safeStorageLabel: "Microsoft Edge",
    roots: {
      linux: {
        base: ["microsoft-edge", "microsoft-edge-beta"],
        home: [".var/app/com.microsoft.Edge/config/microsoft-edge"],
      },
      darwin: { base: ["Microsoft Edge"] },
      win32: { base: ["Microsoft/Edge/User Data"] },
    },
  },
  {
    id: "vivaldi", label: "Vivaldi", keyringApp: "vivaldi", safeStorageLabel: "Vivaldi",
    roots: {
      linux: { base: ["vivaldi"], home: [".var/app/com.vivaldi.Vivaldi/config/vivaldi"] },
      darwin: { base: ["Vivaldi"] },
      win32: { base: ["Vivaldi/User Data"] },
    },
  },
  {
    id: "opera", label: "Opera", keyringApp: "opera", safeStorageLabel: "Opera",
    roots: {
      linux: { base: ["opera", "opera-beta"], home: [".var/app/com.opera.Opera/config/opera"] },
      darwin: { base: ["com.operasoftware.Opera"] },
      win32: { base: ["Programs/Opera/User Data", "Opera Software/Opera Stable"] },
    },
  },
  {
    id: "thorium", label: "Thorium", keyringApp: "thorium", safeStorageLabel: "Thorium",
    roots: { linux: { base: ["thorium"] }, darwin: { base: ["Thorium"] }, win32: { base: ["Thorium/User Data"] } },
  },
  {
    id: "ungoogled", label: "Ungoogled Chromium", keyringApp: "chromium", safeStorageLabel: "Chromium",
    roots: {
      linux: {
        base: ["ungoogled-chromium"],
        home: [".var/app/io.github.ungoogled_software.ungoogled_chromium/config/chromium"],
      },
    },
  },
];

export interface FirefoxBrowserDef {
  id: string;
  label: string;
  roots: Partial<Record<Platform, Roots>>;
}

/** Firefox and the forks that keep its profiles.ini layout. */
export const FIREFOX_BROWSERS: readonly FirefoxBrowserDef[] = [
  {
    id: "firefox", label: "Firefox",
    roots: {
      linux: {
        home: [
          ".mozilla/firefox",
          ".var/app/org.mozilla.firefox/.mozilla/firefox",
          "snap/firefox/common/.mozilla/firefox",
        ],
      },
      darwin: { base: ["Firefox"] },
      win32: { base: ["Mozilla/Firefox"] },
    },
  },
  {
    id: "librewolf", label: "LibreWolf",
    roots: {
      linux: { home: [".librewolf", ".var/app/io.gitlab.librewolf-community/.librewolf"] },
      darwin: { base: ["LibreWolf"] },
      win32: { base: ["LibreWolf"] },
    },
  },
  {
    id: "zen", label: "Zen Browser",
    roots: {
      linux: { home: [".zen", ".var/app/app.zen_browser.zen/.zen"] },
      darwin: { base: ["zen"] },
      win32: { base: ["zen"] },
    },
  },
  {
    id: "floorp", label: "Floorp",
    roots: { linux: { home: [".floorp", ".var/app/one.ablaze.floorp/.floorp"] }, darwin: { base: ["Floorp"] } },
  },
  {
    id: "waterfox", label: "Waterfox",
    roots: { linux: { home: [".waterfox"] }, darwin: { base: ["Waterfox"] }, win32: { base: ["Waterfox"] } },
  },
];

export interface BrowserProfile {
  browserId: string;
  browserLabel: string;
  family: BrowserFamily;
  /** Profile directory name, e.g. "Profile 6", or a Firefox profile path. */
  profileDir: string;
  /** Human name the browser shows for the profile. */
  profileName: string;
  /** Absolute path to the cookie store. */
  cookieDbPath: string;
  keyringApp?: string;
  safeStorageLabel?: string;
  /** Cookie store mtime (ms); newer means more recently used. */
  lastUsed: number;
}

/** Map profile directories to display names from a Chromium `Local State` file. */
export function parseChromiumLocalState(json: string): Record<string, string> {
  const names: Record<string, string> = {};
  try {
    const parsed = JSON.parse(json) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    for (const [dir, meta] of Object.entries(parsed.profile?.info_cache ?? {})) {
      if (typeof meta?.name === "string" && meta.name.trim()) names[dir] = meta.name.trim();
    }
  } catch {
    // A corrupt or partially written Local State just means no friendly names.
  }
  return names;
}

export interface FirefoxProfileEntry {
  name: string;
  path: string;
  isRelative: boolean;
}

/** Parse the `[ProfileN]` sections of a Firefox-style profiles.ini. */
export function parseFirefoxProfilesIni(text: string): FirefoxProfileEntry[] {
  const entries: FirefoxProfileEntry[] = [];
  let current: Partial<FirefoxProfileEntry> & { isProfile?: boolean } = {};

  const flush = () => {
    if (current.isProfile && current.path) {
      entries.push({
        name: current.name || current.path,
        path: current.path,
        isRelative: current.isRelative !== false,
      });
    }
    current = {};
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      flush();
      current = { isProfile: /^\[Profile\d+\]$/i.test(line) };
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === "name") current.name = value;
    else if (key === "path") current.path = value;
    else if (key === "isrelative") current.isRelative = value !== "0";
  }
  flush();
  return entries;
}

/**
 * libsecret lookup attribute sets to try, most current first. Each entry is a
 * complete `secret-tool lookup` argument list.
 */
export function keyringLookupArgs(app: string, safeStorageLabel: string): string[][] {
  return [
    ["lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2", "application", app],
    ["lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v1", "application", app],
    ["lookup", "application", app],
    ["lookup", "service", `${safeStorageLabel} Safe Storage`, "account", safeStorageLabel],
  ];
}

/**
 * Read a Chromium build's Safe Storage password from the login keyring (Linux).
 * Returns undefined when unavailable; the caller then relies on the v10
 * ("peanuts") and empty-key schemes the cookie library already tries.
 *
 * The value is a secret: it is passed in-process only and never logged.
 */
export function resolveKeyringPassword(app: string, safeStorageLabel: string): string | undefined {
  if (process.platform !== "linux") return undefined;
  for (const args of keyringLookupArgs(app, safeStorageLabel)) {
    try {
      const out = execFileSync("secret-tool", args, {
        encoding: "utf8",
        timeout: 3_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const password = out.replace(/\n$/, "");
      if (password.length > 0) return password;
    } catch {
      // Missing secret-tool, locked keyring, or no such entry — try the next shape.
    }
  }
  return undefined;
}

export interface DiscoverOptions {
  home?: string;
  /** Application-data root: $XDG_CONFIG_HOME, ~/Library/Application Support, or %LOCALAPPDATA%. */
  baseDir?: string;
  platform?: Platform;
}

function currentPlatform(): Platform {
  return process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
}

function defaultBaseDir(platform: Platform, home: string): string {
  if (platform === "darwin") return join(home, "Library", "Application Support");
  if (platform === "win32") return process.env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local");
  return process.env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
}

/** Resolve a browser's roots for this platform into absolute directories. */
function rootsFor(roots: Roots | undefined, baseDir: string, home: string): string[] {
  const out: string[] = [];
  for (const dir of roots?.base ?? []) out.push(join(baseDir, dir));
  for (const dir of roots?.home ?? []) out.push(join(home, dir));
  return out;
}

function cookieDbFor(profileRoot: string): string | undefined {
  for (const candidate of [join(profileRoot, "Cookies"), join(profileRoot, "Network", "Cookies")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Every browser profile on this machine that has a cookie store, most recently
 * used first — so auto-detect tries the browser actually in use.
 */
export function discoverProfiles(options: DiscoverOptions = {}): BrowserProfile[] {
  const platform = options.platform ?? currentPlatform();
  const home = options.home ?? homedir();
  const baseDir = options.baseDir ?? defaultBaseDir(platform, home);
  const profiles: BrowserProfile[] = [];
  const seen = new Set<string>();

  for (const browser of CHROMIUM_BROWSERS) {
    for (const root of rootsFor(browser.roots[platform], baseDir, home)) {
      if (!existsSync(root)) continue;

      const localStatePath = join(root, "Local State");
      let names: Record<string, string> = {};
      try {
        if (existsSync(localStatePath)) names = parseChromiumLocalState(readFileSync(localStatePath, "utf8"));
      } catch {
        // Unreadable Local State: fall back to directory names.
      }

      const dirs = new Set(Object.keys(names));
      try {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (entry.isDirectory() && (entry.name === "Default" || /^Profile \d+$/.test(entry.name))) {
            dirs.add(entry.name);
          }
        }
      } catch {
        // Unreadable browser directory: keep whatever Local State listed.
      }

      for (const dir of dirs) {
        const cookieDbPath = cookieDbFor(join(root, dir));
        if (!cookieDbPath || seen.has(cookieDbPath)) continue;
        seen.add(cookieDbPath);
        profiles.push({
          browserId: browser.id,
          browserLabel: browser.label,
          family: "chromium",
          profileDir: dir,
          profileName: names[dir] ?? dir,
          cookieDbPath,
          keyringApp: browser.keyringApp,
          safeStorageLabel: browser.safeStorageLabel,
          lastUsed: mtimeMs(cookieDbPath),
        });
      }
    }
  }

  for (const browser of FIREFOX_BROWSERS) {
    for (const root of rootsFor(browser.roots[platform], baseDir, home)) {
      const profilesIni = join(root, "profiles.ini");
      if (!existsSync(profilesIni)) continue;
      let entries: FirefoxProfileEntry[] = [];
      try {
        entries = parseFirefoxProfilesIni(readFileSync(profilesIni, "utf8"));
      } catch {
        continue;
      }
      for (const entry of entries) {
        const dir = entry.isRelative ? join(root, entry.path) : entry.path;
        const cookieDbPath = join(dir, "cookies.sqlite");
        if (!existsSync(cookieDbPath) || seen.has(cookieDbPath)) continue;
        seen.add(cookieDbPath);
        profiles.push({
          browserId: browser.id,
          browserLabel: browser.label,
          family: "firefox",
          profileDir: dir,
          profileName: entry.name,
          cookieDbPath,
          lastUsed: mtimeMs(cookieDbPath),
        });
      }
    }
  }

  if (platform === "darwin") {
    for (const cookieDbPath of [
      join(home, "Library", "Containers", "com.apple.Safari", "Data", "Library", "Cookies", "Cookies.binarycookies"),
      join(home, "Library", "Cookies", "Cookies.binarycookies"),
    ]) {
      if (!existsSync(cookieDbPath) || seen.has(cookieDbPath)) continue;
      seen.add(cookieDbPath);
      profiles.push({
        browserId: "safari",
        browserLabel: "Safari",
        family: "safari",
        profileDir: "Default",
        profileName: "Safari",
        cookieDbPath,
        lastUsed: mtimeMs(cookieDbPath),
      });
      break;
    }
  }

  return profiles.sort((a, b) => b.lastUsed - a.lastUsed || a.browserLabel.localeCompare(b.browserLabel));
}

/** "Chromium — Your Chromium" / "Firefox — default-release" */
export function describeProfile(profile: BrowserProfile): string {
  if (profile.family === "safari") return profile.browserLabel;
  const name = profile.profileName;
  const short = name && name !== profile.profileDir ? name : profile.profileDir.split(/[\\/]/).pop() || profile.profileDir;
  return `${profile.browserLabel} — ${short}`;
}

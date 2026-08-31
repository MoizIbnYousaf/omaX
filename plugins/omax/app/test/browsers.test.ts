import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseChromiumLocalState,
  parseFirefoxProfilesIni,
  keyringLookupArgs,
  discoverProfiles,
  describeProfile,
  CHROMIUM_BROWSERS,
  FIREFOX_BROWSERS,
} from "../src/browsers.js";

function chromiumProfile(root: string, dir: string, names: Record<string, string>, nested = false): string {
  const profileRoot = join(root, dir);
  mkdirSync(nested ? join(profileRoot, "Network") : profileRoot, { recursive: true });
  writeFileSync(join(root, "Local State"), JSON.stringify({
    profile: { info_cache: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, { name: v }])) },
  }));
  const db = nested ? join(profileRoot, "Network", "Cookies") : join(profileRoot, "Cookies");
  writeFileSync(db, "x");
  return db;
}

function firefoxProfile(root: string, dirName: string, profileName: string): string {
  const profileRoot = join(root, dirName);
  mkdirSync(profileRoot, { recursive: true });
  writeFileSync(join(root, "profiles.ini"),
    ["[Profile0]", `Name=${profileName}`, "IsRelative=1", `Path=${dirName}`].join("\n"));
  const db = join(profileRoot, "cookies.sqlite");
  writeFileSync(db, "x");
  return db;
}

describe("parseChromiumLocalState", () => {
  test("maps profile directories to display names", () => {
    const names = parseChromiumLocalState(
      JSON.stringify({ profile: { info_cache: { "Profile 6": { name: "Your Chromium" }, Default: { name: "Abdul Moiz" } } } }),
    );
    expect(names).toEqual({ "Profile 6": "Your Chromium", Default: "Abdul Moiz" });
  });

  test("survives corrupt or unexpected JSON", () => {
    expect(parseChromiumLocalState("{not json")).toEqual({});
    expect(parseChromiumLocalState("{}")).toEqual({});
    expect(parseChromiumLocalState(JSON.stringify({ profile: { info_cache: { A: { name: "  " } } } }))).toEqual({});
  });
});

describe("parseFirefoxProfilesIni", () => {
  test("reads profile sections and skips other sections", () => {
    const entries = parseFirefoxProfilesIni(
      ["[Install123]", "Default=abc.default", "", "[Profile0]", "Name=default-release", "IsRelative=1", "Path=xyz.default-release", "", "[Profile1]", "Name=work", "IsRelative=0", "Path=/opt/ff/work"].join("\n"),
    );
    expect(entries).toEqual([
      { name: "default-release", path: "xyz.default-release", isRelative: true },
      { name: "work", path: "/opt/ff/work", isRelative: false },
    ]);
  });

  test("defaults IsRelative to true and falls back to path for a missing name", () => {
    expect(parseFirefoxProfilesIni(["[Profile0]", "Path=solo.default"].join("\n")))
      .toEqual([{ name: "solo.default", path: "solo.default", isRelative: true }]);
  });
});

describe("keyringLookupArgs", () => {
  test("tries the modern libsecret schema before the legacy service/account pair", () => {
    const args = keyringLookupArgs("chromium", "Chromium");
    expect(args[0]).toEqual([
      "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2", "application", "chromium",
    ]);
    expect(args.at(-1)).toEqual(["lookup", "service", "Chromium Safe Storage", "account", "Chromium"]);
  });
});

describe("browser catalog", () => {
  test("every browser id is unique across both families", () => {
    const ids = [...CHROMIUM_BROWSERS, ...FIREFOX_BROWSERS].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("covers Linux, macOS and Windows for the mainstream browsers", () => {
    for (const id of ["chromium", "chrome", "brave", "edge"]) {
      const browser = CHROMIUM_BROWSERS.find((b) => b.id === id)!;
      expect(Object.keys(browser.roots).sort()).toEqual(["darwin", "linux", "win32"]);
    }
    const firefox = FIREFOX_BROWSERS.find((b) => b.id === "firefox")!;
    expect(Object.keys(firefox.roots).sort()).toEqual(["darwin", "linux", "win32"]);
  });
});

describe("discoverProfiles on Linux", () => {
  let root: string;
  let baseDir: string;
  let home: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "omax-linux-"));
    baseDir = join(root, "config");
    home = join(root, "home");

    // Native Chromium: two profiles, only one with a cookie store.
    const chromium = join(baseDir, "chromium");
    mkdirSync(join(chromium, "Profile 10"), { recursive: true });
    const chromiumDb = chromiumProfile(chromium, "Profile 6", { "Profile 6": "Your Chromium", "Profile 10": "Moiz" });

    // Chrome with the newer Network/Cookies layout.
    const chromeDb = chromiumProfile(join(baseDir, "google-chrome"), "Default", { Default: "Abdul Moiz" }, true);

    // Flatpak Brave and Snap Chromium.
    const braveDb = chromiumProfile(join(home, ".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser"), "Default", { Default: "Flatpak Brave" });
    const snapDb = chromiumProfile(join(home, "snap/chromium/common/chromium"), "Default", { Default: "Snap Chromium" });

    // Firefox and a fork.
    const ffDb = firefoxProfile(join(home, ".mozilla/firefox"), "abc.default-release", "default-release");
    const lwDb = firefoxProfile(join(home, ".librewolf"), "lw.default", "librewolf-default");

    // Explicit ages: Chrome is the live browser, everything else is older.
    const ages: Array<[string, number]> = [
      [chromeDb, 1], [braveDb, 2], [snapDb, 3], [chromiumDb, 4], [ffDb, 5], [lwDb, 6],
    ];
    for (const [db, hoursAgo] of ages) {
      const when = new Date(Date.now() - hoursAgo * 3_600_000);
      utimesSync(db, when, when);
    }
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("finds native, Flatpak, Snap and fork installs", () => {
    const found = discoverProfiles({ home, baseDir, platform: "linux" });
    expect(found.map((p) => p.browserId).sort()).toEqual(
      ["brave", "chrome", "chromium", "chromium", "firefox", "librewolf"],
    );
  });

  test("skips profile directories that have no cookie store", () => {
    const found = discoverProfiles({ home, baseDir, platform: "linux" });
    expect(found.some((p) => p.profileDir === "Profile 10")).toBe(false);
  });

  test("orders most recently used first so auto-detect tries the live browser", () => {
    expect(discoverProfiles({ home, baseDir, platform: "linux" })[0]?.browserId).toBe("chrome");
  });

  test("carries real profile names and per-build keyring identity", () => {
    const chromium = discoverProfiles({ home, baseDir, platform: "linux" })
      .find((p) => p.profileName === "Your Chromium");
    expect(chromium?.keyringApp).toBe("chromium");
    expect(describeProfile(chromium!)).toBe("Chromium — Your Chromium");
  });

  test("resolves Network/Cookies stores", () => {
    const chrome = discoverProfiles({ home, baseDir, platform: "linux" }).find((p) => p.browserId === "chrome");
    expect(chrome?.cookieDbPath.endsWith(join("Default", "Network", "Cookies"))).toBe(true);
  });

  test("firefox profiles point at cookies.sqlite", () => {
    const ff = discoverProfiles({ home, baseDir, platform: "linux" }).find((p) => p.browserId === "firefox");
    expect(ff?.family).toBe("firefox");
    expect(ff?.cookieDbPath.endsWith("cookies.sqlite")).toBe(true);
  });

  test("returns nothing when no browsers are installed", () => {
    expect(discoverProfiles({ home: join(root, "empty"), baseDir: join(root, "empty"), platform: "linux" })).toEqual([]);
  });
});

describe("discoverProfiles on macOS and Windows", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "omax-cross-"));

    // macOS: Chrome under Application Support, plus Safari's binarycookies.
    const macHome = join(root, "mac");
    const macBase = join(macHome, "Library", "Application Support");
    chromiumProfile(join(macBase, "Google/Chrome"), "Default", { Default: "Work" });
    const safariDir = join(macHome, "Library", "Containers", "com.apple.Safari", "Data", "Library", "Cookies");
    mkdirSync(safariDir, { recursive: true });
    writeFileSync(join(safariDir, "Cookies.binarycookies"), "x");

    // Windows: Edge under LOCALAPPDATA.
    const winHome = join(root, "win");
    chromiumProfile(join(winHome, "AppData/Local", "Microsoft/Edge/User Data"), "Default", { Default: "Home" });
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("finds macOS Chromium profiles and Safari", () => {
    const macHome = join(root, "mac");
    const found = discoverProfiles({
      home: macHome, baseDir: join(macHome, "Library", "Application Support"), platform: "darwin",
    });
    expect(found.map((p) => p.browserId).sort()).toEqual(["chrome", "safari"]);
    expect(describeProfile(found.find((p) => p.browserId === "safari")!)).toBe("Safari");
  });

  test("finds Windows profiles under LOCALAPPDATA", () => {
    const winHome = join(root, "win");
    const found = discoverProfiles({
      home: winHome, baseDir: join(winHome, "AppData/Local"), platform: "win32",
    });
    expect(found.map((p) => p.browserId)).toEqual(["edge"]);
    expect(found[0]?.profileName).toBe("Home");
  });

  test("Safari is not offered on Linux", () => {
    const macHome = join(root, "mac");
    const found = discoverProfiles({
      home: macHome, baseDir: join(macHome, "Library", "Application Support"), platform: "linux",
    });
    expect(found.some((p) => p.family === "safari")).toBe(false);
  });
});

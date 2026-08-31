import { Box, Text, createCliRenderer, type CliRenderer, CliRenderEvents, type KeyEvent } from "@opentui/core";
import { TwitterClient, type TwitterUser, type CookieSource } from "./lib/x-client/index.js";
import { resolveSession } from "./auth.js";
import { discoverProfiles, describeProfile, type BrowserProfile } from "./browsers.js";
import { OmaXApp } from "./ui/app.js";
import { theme } from "./ui/theme.js";
import { applyOmarchyTheme, watchOmarchyTheme } from "./ui/omarchy-theme.js";
import { createDemoClient } from "./demo/demo-client.js";

const skipPicker = process.argv.includes("--no-picker") || process.argv.includes("--auto");
const demoMode = process.argv.includes("--demo") || process.env.OMAX_DEMO === "1";
const profileArg = (() => {
  const idx = process.argv.indexOf("--profile");
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
})();

async function connectWithProfile(opts?: {
  cookieSource?: CookieSource;
  chromeProfile?: string;
  profile?: BrowserProfile;
}): Promise<{ client: TwitterClient; me: TwitterUser; profile?: BrowserProfile }> {
  const { cookies, profile } = await resolveSession(opts);

  const client = new TwitterClient({ cookies });
  const userResult = await client.getCurrentUser();
  if (!userResult.success || !userResult.user) {
    throw new Error(`Failed to authenticate: ${userResult.error ?? "unknown error"}`);
  }

  return { client, me: userResult.user, profile };
}

async function launchApp(renderer: CliRenderer, client: TwitterClient, me: TwitterUser): Promise<void> {
  let app: OmaXApp | undefined;
  try {
    app = new OmaXApp(renderer, client, me, "auto");
    watchOmarchyTheme(() => app?.retheme());
    await app.start();
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}

async function showPicker(renderer: CliRenderer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let statusMessage = "Select an account to connect";
    let connecting = false;

    const BROWSER_ICONS: Record<string, string> = {
      chromium: "●", chrome: "●", brave: "◆", edge: "◈", vivaldi: "◉", opera: "◍", firefox: "◆",
    };

    interface PickerEntry {
      label: string;
      description: string;
      icon: string;
      profile?: BrowserProfile;
    }

    const discovered = discoverProfiles();
    const accounts: PickerEntry[] = [
      {
        label: "Auto-detect",
        description: discovered.length
          ? `Try ${discovered.length} profile${discovered.length === 1 ? "" : "s"}, most recent first`
          : "Scan installed browsers",
        icon: "◎",
      },
      ...discovered.map((profile) => ({
        label: describeProfile(profile),
        description: profile.profileDir,
        icon: BROWSER_ICONS[profile.browserId] ?? "●",
        profile,
      })),
    ];

    let selectedIndex = 0;

    function render() {
      for (const child of renderer.root.getChildren()) {
        child.destroyRecursively();
      }

      const items = accounts.map((account, index) => {
        const selected = index === selectedIndex;
        const icon = account.icon;
        const label = account.label;

        return Box(
          {
            id: `account-${index}`,
            width: "100%",
            maxWidth: 48,
            backgroundColor: selected ? "#0F1825" : undefined,
            paddingLeft: 1,
            paddingRight: 1,
            height: 2,
            flexDirection: "row",
            alignItems: "center",
            gap: 1,
          },
          Text({
            content: selected ? `  ${icon}` : `  ${icon}`,
            fg: selected ? theme.accent : theme.textMuted,
          }),
          Box(
            { flexDirection: "column", flexGrow: 1 },
            Text({
              content: label,
              fg: selected ? "#FFFFFF" : theme.textPrimary,
            }),
            Text({
              content: account.description,
              fg: theme.textMuted,
            }),
          ),
          selected
            ? Text({ content: "→", fg: theme.accent })
            : null,
        );
      });

      renderer.root.add(
        Box(
          {
            id: "picker-shell",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            backgroundColor: theme.background,
            alignItems: "center",
            justifyContent: "center",
          },
          Box(
            {
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 1,
            },
            Text({ content: "  ╭────────────╮", fg: theme.border }),
            Text({ content: "  │     𝕏      │", fg: theme.accent }),
            Text({ content: "  ╰────────────╯", fg: theme.border }),
          ),
          Text({ content: "omaX", fg: theme.accentStrong }),
          Box({ height: 1 }),
          Text({ content: "Select an account", fg: theme.textPrimary }),
          Text({ content: connecting ? statusMessage : "Choose how to connect to X", fg: theme.textMuted }),
          Box({ height: 1 }),
          Box(
            {
              width: "100%",
              maxWidth: 50,
              borderStyle: "rounded",
              borderColor: theme.border,
              backgroundColor: theme.surface,
              flexDirection: "column",
              paddingTop: 1,
              paddingBottom: 1,
            },
            ...items,
          ),
          Box({ height: 1 }),
          Box(
            {
              flexDirection: "row",
              gap: 2,
            },
            Text({ content: "↑↓", fg: theme.textMuted }),
            Text({ content: "navigate", fg: theme.textMuted }),
            Text({ content: "⏎", fg: theme.textMuted }),
            Text({ content: "connect", fg: theme.accent }),
            Text({ content: "q", fg: theme.textMuted }),
            Text({ content: "quit", fg: theme.textMuted }),
          ),
        ),
      );
    }

    async function onSelect(account: PickerEntry) {
      if (connecting) return;
      connecting = true;
      statusMessage = `Connecting via ${account.label}...`;
      render();

      try {
        const { client, me } = await connectWithProfile(
          account.profile ? { profile: account.profile } : undefined,
        );

        renderer.keyInput.off("keypress", handleKey);
        statusMessage = `Logged in as @${me.username}`;
        render();

        await launchApp(renderer, client, me);
        resolve();
      } catch (error) {
        connecting = false;
        statusMessage = `Failed: ${(error as Error).message}`;
        render();
      }
    }

    function handleKey(key: KeyEvent) {
      if (connecting) return;

      if (key.name === "j" || key.name === "down") {
        selectedIndex = Math.min(accounts.length - 1, selectedIndex + 1);
        render();
      } else if (key.name === "k" || key.name === "up") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      } else if (key.name === "return") {
        void onSelect(accounts[selectedIndex]);
      } else if (key.name === "q" || key.name === "escape") {
        renderer.keyInput.off("keypress", handleKey);
        renderer.destroy();
        resolve();
      }
    }

    renderer.keyInput.on("keypress", handleKey);
    render();
  });
}

async function main(): Promise<void> {
  applyOmarchyTheme();

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    autoFocus: true,
    targetFps: 30,
    // Disable threaded stdout writer. With useThread: true (default on macOS),
    // OpenTUI writes frames from a native zig thread while our Kitty graphics
    // escapes go through process.stdout.write on the JS main thread. The two
    // writers interleave at the byte level, splitting our APC sequences and
    // causing terminals to print the base64 payload as plain text.
    useThread: false,
  });
  // OpenTUI registers selection listeners for visible renderables. A timeline
  // naturally exceeds EventEmitter's server-oriented default of ten; a finite
  // ceiling still lets genuine accumulation surface during the stress suite.
  renderer.setMaxListeners(256);

  if (demoMode) {
    renderer.disableStdoutInterception();
    console.log("omaX: demo mode (offline fixtures, no cookies)");
    process.env.OMAX_DEMO = "1";
    const { client, me } = await createDemoClient();
    await launchApp(renderer, client, me);
    return;
  }

  if (skipPicker || profileArg) {
    renderer.disableStdoutInterception();
    console.log("omaX: resolving X session cookies...");

    let opts: { profile?: BrowserProfile; chromeProfile?: string } | undefined;
    if (profileArg) {
      const needle = profileArg.toLowerCase();
      const match = discoverProfiles().find(
        (p) =>
          p.profileDir.toLowerCase() === needle ||
          p.profileName.toLowerCase() === needle ||
          describeProfile(p).toLowerCase().includes(needle),
      );
      // Fall back to treating the argument as a profile dir or cookie DB path.
      opts = match ? { profile: match } : { chromeProfile: profileArg };
    }

    const { client, me, profile } = await connectWithProfile(opts);
    console.log(`Logged in as @${me.username}${profile ? ` via ${describeProfile(profile)}` : ""}`);
    await launchApp(renderer, client, me);
    return;
  }

  renderer.disableStdoutInterception();
  await showPicker(renderer);
}

void main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});

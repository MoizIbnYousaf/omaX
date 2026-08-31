# Changelog

## 0.1.0 — 2026-08-31

First release of omaX, forked from `xterminal` and rebuilt as an Omarchy
product.

### Added

- **Omarchy theming, end to end.** The palette is read from the active theme's
  `colors.toml` at startup and mapped onto every UI role, and a watcher
  re-themes a running client when the desktop theme changes.
- **Universal browser discovery.** Sessions are found across Chromium, Chrome,
  Brave, Edge, Vivaldi, Opera, Thorium and Ungoogled Chromium, plus Firefox,
  LibreWolf, Zen, Floorp and Waterfox — native, Flatpak and Snap layouts on
  Linux, with macOS and Windows locations and Safari on macOS. Profiles carry
  the names their browser shows and are tried most-recently-used first.
- **Offline demo mode** (`omax demo`): the whole interface on local fixtures,
  with repository-owned fictional avatars, so it runs and is tested without a
  login or network access.
- **One launcher** — `omax`, `omax demo`, `omax cli`, `omax doctor` — that
  installs its runtime under `~/.local/state/omax` and never mutates the
  deployed tree.
- **Omarchy bar launcher** (`greensnow.omax`) opening omaX in kitty.
- **Agent skill** (`skills/omax`) for reading and, with explicit approval,
  posting to X.
- Release gate: typecheck, unit tests, and a complete offline TUI suite driven
  through tmux.

### Fixed

- Profile photos now map both user payload shapes emitted by X across timeline,
  search, lists and profiles. Image fetching validates every redirect, host,
  response type, size and timeout; a failed image keeps a visible text fallback.

- **Browser auto-detect found no session even when logged in.** Discovery only
  scanned Google Chrome's directory, and v11 cookies never decrypted because
  the Safe Storage password was looked up under the legacy
  `service "Chrome Safe Storage"` entry. Modern Chromium keeps it in libsecret
  under `chrome_libsecret_os_crypt_password_v2` with a per-build `application`
  attribute, so each build is now unlocked with its own key.
- The account picker no longer offers macOS-only Safari and invented
  "Profile 2"/"Profile 3" entries on Linux.

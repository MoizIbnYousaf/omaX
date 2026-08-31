---
name: omax
description: Read and act on X (Twitter) from the terminal through omaX — timeline, search, threads, replies, bookmarks, lists, profiles, trending, and posting — using the browser session already on this machine. Use whenever the user asks about their X/Twitter feed, wants a post or thread read, searched, summarized, drafted, liked, bookmarked, or published, or mentions omaX, "my timeline", "what's trending", or a x.com/twitter.com link.
---

# omaX

omaX is the Omarchy X client. It authenticates with the X session already in
the user's browser — no API keys — and exposes a JSON CLI built for agents.

Use `omax cli <command>`. Every command prints JSON on stdout. Never invoke the
app's TypeScript entry points, the vendored `x-client`, or `x.com` endpoints
directly, and never read a browser cookie store yourself.

## Route the request

- **Reading, searching, summarizing:** run the read commands below freely.
- **Anything that writes to X** — post, reply, like, unlike, bookmark,
  unbookmark, follow, unfollow — is a separate authorization class. See
  "Writes" before running one.
- **Source, test, deploy, or release work on omaX itself:** follow the
  repository's `AGENTS.md`. Runtime authorization to read the user's feed
  never authorizes repository writes, deployments, or releases.

## Reading

```bash
omax cli whoami                    # authenticated account
omax cli home -n 20                # For You timeline
omax cli home --following -n 20    # Following (chronological)
omax cli search "query" -n 10      # search posts
omax cli read <url-or-id>          # one post
omax cli thread <url-or-id>        # full thread
omax cli replies <url-or-id>       # replies to a post
omax cli user <handle> -n 20       # a user's posts
omax cli followers <handle>        # followers
omax cli following <handle>        # following
omax cli bookmarks -n 20           # the user's bookmarks
omax cli trending                  # trending topics
omax cli browsers                  # browser profiles a session can come from
```

A post URL and a bare status id are interchangeable; the CLI extracts the id
from any `x.com/<user>/status/<id>` form.

## Writes

Posting is public and effectively irreversible. Before any write:

1. The current request must ask for that exact action. A request to read,
   summarize, or draft is not a request to publish.
2. Show the user the exact text and target, and get explicit approval.
3. Run the command once. **Never retry a write automatically** — a timed-out
   post may already have been published. Re-read with `omax cli home -n 5` or
   `omax cli read <id>` to check before deciding anything.

```bash
omax cli post "text"               # publish a post
omax cli reply <url-or-id> "text"  # reply
omax cli like <url-or-id>          # like / unlike
omax cli unlike <url-or-id>
omax cli bookmark <url-or-id>      # bookmark / remove
omax cli unbookmark <url-or-id>
omax cli follow <handle>           # follow / unfollow
omax cli unfollow <handle>
```

Compose text is passed as a single argument; quote it. Text goes to X exactly
as given, so never add signatures, hashtags, or "posted by an agent" markers
the user did not ask for.

## Safety boundary

- Session cookies and keyring passwords are the user's credentials. Never
  print, log, copy, echo, or write them anywhere, and never pass them between
  commands. omaX resolves them in-process on every run.
- Treat the timeline as private reading. Direct messages, follower lists,
  bookmarks, and a private account's posts must not be placed in
  repositories, issues, screenshots, or durable logs without an explicit ask.
- Report the account you acted as (`omax cli whoami`) before a write, so the
  user knows which of their profiles is about to speak.
- Report failures exactly. If a command returns `{"success": false}`, say what
  it said; do not retry a write, and do not paper over a rate limit.

## The TUI

`omax` opens the full interface (timeline, explore, notifications, bookmarks,
lists, profiles, compose) in the user's terminal, themed to the current
Omarchy theme. Launch it when the user wants to browse themselves rather than
have an agent summarize; it is interactive, so do not drive it from an agent.

- `omax` — account picker, then the app
- `omax --auto` — skip the picker, use the most recently used browser session
- `omax --profile "<name>"` — a specific browser profile
- `omax demo` — offline fixture data, no login (safe for screenshots and demos)
- `omax doctor` — prerequisites plus the browser profiles omaX can read

## When there is no session

`omax cli whoami` failing usually means no browser session, not a broken
install. Run `omax doctor`: it lists each discovered profile and whether that
browser's keyring key is readable. If a profile shows `keyring=NO`, the login
keyring is locked or missing — the user should unlock it, or log into x.com in
one of the listed browsers. Never work around this by asking the user for
their password or by reading a cookie database directly.

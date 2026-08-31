#!/usr/bin/env bun
/**
 * omaX headless CLI: JSON output for agents and scripts.
 * Usage: x <command> [args] [--json]
 */

import { TwitterClient } from "./lib/x-client/index.js";
import { resolveSession } from "./auth.js";
import { discoverProfiles, describeProfile, resolveKeyringPassword } from "./browsers.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  console.log(`omaX CLI

Usage: x <command> [options]

Commands:
  whoami                       Current authenticated user
  read <url-or-id>             Read a single tweet
  thread <url-or-id>           Full thread for a tweet
  replies <url-or-id>          Replies to a tweet
  home [-n count]              Home timeline (For You)
  home --following [-n count]  Home timeline (Following)
  user <handle> [-n count]     User's tweets
  search <query> [-n count]    Search tweets
  bookmarks [-n count]         Your bookmarks
  trending                     Trending topics
  post <text>                  Post a tweet
  reply <url-or-id> <text>     Reply to a tweet
  like <url-or-id>             Like a tweet
  unlike <url-or-id>           Unlike a tweet
  bookmark <url-or-id>         Bookmark a tweet
  unbookmark <url-or-id>       Remove bookmark
  follow <handle>              Follow a user
  unfollow <handle>            Unfollow a user
  followers <handle> [-n count]  List followers
  following <handle> [-n count]  List following
  browsers                     Browser profiles omaX can read a session from

All commands output JSON.`);
  process.exit(0);
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function getCount(): number {
  return parseInt(getArg("-n") ?? "20", 10);
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function extractId(input: string): string {
  const match = input.match(/status\/(\d+)/);
  return match ? match[1] : input;
}

async function run() {
  if (command === "browsers") {
    // Reports availability only — never cookie values or keyring secrets.
    const profiles = discoverProfiles().map((profile) => ({
      browser: profile.browserLabel,
      profile: profile.profileName,
      profileDir: profile.profileDir,
      family: profile.family,
      label: describeProfile(profile),
      cookieStore: profile.cookieDbPath,
      lastUsed: new Date(profile.lastUsed).toISOString(),
      keyringPasswordAvailable:
        profile.family === "chromium" && profile.keyringApp && profile.safeStorageLabel
          ? resolveKeyringPassword(profile.keyringApp, profile.safeStorageLabel) !== undefined
          : null,
    }));
    console.log(JSON.stringify({ profiles }, null, 2));
    return;
  }

  const { cookies } = await resolveSession();
  const client = new TwitterClient({ cookies });

  switch (command) {
    case "whoami": {
      const result = await client.getCurrentUser();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "read": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x read <url-or-id>"); process.exit(1); }
      const result = await client.getTweet(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "thread": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x thread <url-or-id>"); process.exit(1); }
      const result = await client.getThread(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "replies": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x replies <url-or-id>"); process.exit(1); }
      const result = await client.getReplies(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "home": {
      const count = getCount();
      const result = hasFlag("--following")
        ? await client.getHomeLatestTimeline(count)
        : await client.getHomeTimeline(count);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "user": {
      const handle = args[1]?.replace(/^@/, "");
      if (!handle) { console.error("Usage: x user <handle>"); process.exit(1); }
      const lookup = await client.getUserIdByUsername(handle);
      if (!lookup.success || !lookup.userId) {
        console.log(JSON.stringify(lookup, null, 2));
        break;
      }
      const result = await client.getUserTweetsPaged(lookup.userId, getCount());
      console.log(JSON.stringify({ ...result, userId: lookup.userId, username: lookup.username }, null, 2));
      break;
    }

    case "search": {
      const query = args[1];
      if (!query) { console.error("Usage: x search <query>"); process.exit(1); }
      const result = await client.search(query, getCount());
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "trending":
    case "news": {
      const result = await client.getNews(getCount());
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "post":
    case "tweet": {
      const text = args.slice(1).join(" ");
      if (!text) { console.error("Usage: x post <text>"); process.exit(1); }
      const result = await client.tweet(text);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "reply": {
      const id = extractId(args[1]);
      const text = args.slice(2).join(" ");
      if (!id || !text) { console.error("Usage: x reply <url-or-id> <text>"); process.exit(1); }
      const result = await client.reply(text, id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "like": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x like <url-or-id>"); process.exit(1); }
      const result = await client.like(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "unlike": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x unlike <url-or-id>"); process.exit(1); }
      const result = await client.unlike(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "bookmark": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x bookmark <url-or-id>"); process.exit(1); }
      const result = await client.bookmark(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "unbookmark": {
      const id = extractId(args[1]);
      if (!id) { console.error("Usage: x unbookmark <url-or-id>"); process.exit(1); }
      const result = await client.unbookmark(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "follow": {
      const handle = args[1]?.replace(/^@/, "");
      if (!handle) { console.error("Usage: x follow <handle>"); process.exit(1); }
      const lookup = await client.getUserIdByUsername(handle);
      if (!lookup.success || !lookup.userId) {
        console.log(JSON.stringify(lookup, null, 2));
        break;
      }
      const result = await client.follow(lookup.userId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "unfollow": {
      const handle = args[1]?.replace(/^@/, "");
      if (!handle) { console.error("Usage: x unfollow <handle>"); process.exit(1); }
      const lookup = await client.getUserIdByUsername(handle);
      if (!lookup.success || !lookup.userId) {
        console.log(JSON.stringify(lookup, null, 2));
        break;
      }
      const result = await client.unfollow(lookup.userId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "followers": {
      const handle = args[1]?.replace(/^@/, "");
      if (!handle) { console.error("Usage: x followers <handle>"); process.exit(1); }
      const lookup = await client.getUserIdByUsername(handle);
      if (!lookup.success || !lookup.userId) {
        console.log(JSON.stringify(lookup, null, 2));
        break;
      }
      const result = await client.getFollowers(lookup.userId, getCount());
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "following": {
      const handle = args[1]?.replace(/^@/, "");
      if (!handle) { console.error("Usage: x following <handle>"); process.exit(1); }
      const lookup = await client.getUserIdByUsername(handle);
      if (!lookup.success || !lookup.userId) {
        console.log(JSON.stringify(lookup, null, 2));
        break;
      }
      const result = await client.getFollowing(lookup.userId, getCount());
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run 'x --help' for usage.`);
      process.exit(1);
  }
}

run().catch((e) => {
  console.error(JSON.stringify({ success: false, error: (e as Error).message }));
  process.exit(1);
});

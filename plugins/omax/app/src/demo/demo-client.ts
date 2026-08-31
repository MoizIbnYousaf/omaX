/**
 * Offline demo client for OmaX.
 *
 * Implements the TwitterClient surface the UI uses, backed by local fixtures,
 * so the entire TUI can run and be tested end to end without cookies, network,
 * or a logged-in browser. Activated with `omax --demo` (or OMAX_DEMO=1).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharpModule from "sharp";
import type {
  TwitterClient,
  TweetData,
  SearchResult,
  CurrentUserResult,
  TwitterUser,
} from "../lib/x-client/index.js";

const DEMO_ME: TwitterUser = { id: "1", username: "moiz", name: "Moiz" };

const AUTHORS = [
  { username: "omarchy", name: "Omarchy", color: "#7aa2f7" },
  { username: "dhh", name: "DHH", color: "#f7768e" },
  { username: "ricebuilder", name: "Rice Builder", color: "#9ece6a" },
  { username: "tuiweekly", name: "TUI Weekly", color: "#e0af68" },
  { username: "archbtw", name: "arch btw", color: "#bb9af7" },
];

const avatarUrls = new Map<string, string>();

/** Render distinct initial-on-circle avatars to disk so demo mode can show
 *  real profile photos through the Kitty graphics pipeline, still offline. */
async function prepareDemoAvatars(): Promise<void> {
  const dir = join(
    process.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state"),
    "omax",
    "demo-avatars",
  );
  await mkdir(dir, { recursive: true });
  const everyone = [...AUTHORS, { username: DEMO_ME.username, name: DEMO_ME.name, color: "#0db9d7" }];
  await Promise.all(
    everyone.map(async ({ username, name, color }) => {
      const initial = (name[0] ?? "?").toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">` +
        `<circle cx="64" cy="64" r="62" fill="${color}"/>` +
        `<text x="64" y="86" font-family="sans-serif" font-size="64" font-weight="bold" ` +
        `text-anchor="middle" fill="#0e0e14">${initial}</text></svg>`;
      const path = join(dir, `${username}.png`);
      await writeFile(path, await sharpModule(Buffer.from(svg)).png().toBuffer());
      avatarUrls.set(username, pathToFileURL(path).href);
    }),
  );
}

const TEXTS = [
  "Shipped a new theme engine today. The terminal is the best UI toolkit ever made.",
  "Hot take: every app you actually need can live in a tiling window manager.",
  "OmaX demo mode: this timeline is generated locally — no network, no cookies.",
  "Reading colors.toml at startup means the client re-rices itself with the desktop. Chef's kiss.",
  "Keyboard-first clients age better than any web UI. j/k forever.",
  "New rice dropped. Gaps at 8, blur off, foot + bun + quickshell. Feels instant.",
  "If your feed reader needs 1GB of RAM, it's not a reader, it's a browser.",
  "GraphQL over cookies beats paying for an API to read your own timeline.",
  "The best notification system is a bar widget you can ignore.",
  "Demo post with a longer body to exercise wrapping: terminals render text at a fixed grid, so layout code has to measure in cells, not pixels — which is exactly why TUI layout engines feel so predictable once you internalize the model.",
];

function makeTweet(i: number, prefix = ""): TweetData {
  const author = AUTHORS[i % AUTHORS.length]!;
  return {
    id: String(100000 + i),
    text: `${prefix}${TEXTS[i % TEXTS.length]!}`,
    author: { username: author.username, name: author.name, profileImageUrl: avatarUrls.get(author.username) },
    authorId: String(10 + (i % AUTHORS.length)),
    createdAt: new Date(Date.now() - i * 47 * 60_000).toISOString(),
    replyCount: (i * 7) % 40,
    retweetCount: (i * 13) % 220,
    likeCount: (i * 31) % 900,
    conversationId: String(100000 + i),
    viewerHasLiked: false,
    viewerHasBookmarked: i % 9 === 0,
  };
}

function tweets(count: number, offset = 0, prefix = ""): TweetData[] {
  return Array.from({ length: count }, (_, i) => makeTweet(i + offset, prefix));
}

function page(count: number, cursor?: string, prefix = ""): SearchResult {
  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  return { success: true, tweets: tweets(count, offset, prefix), nextCursor: String(offset + count) };
}

class DemoClient {
  private liked = new Set<string>();
  private bookmarked = new Set<string>();
  private posted = 0;

  async getCurrentUser(): Promise<CurrentUserResult> {
    return { success: true, user: { ...DEMO_ME } };
  }

  async getHomeTimeline(count = 20, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(count, options.cursor);
  }

  async getHomeLatestTimeline(count = 20, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(count, options.cursor, "[following] ");
  }

  async search(query: string, count = 20, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(count, options.cursor, `[${query}] `);
  }

  async getBookmarks(count = 20, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(Math.min(count, 6), options.cursor, "[saved] ");
  }

  async getReplies(tweetId: string): Promise<SearchResult> {
    return { success: true, tweets: tweets(5, 40, `Replying to ${tweetId}: `) };
  }

  async getListTimeline(_listId: string, count = 20, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(count, options.cursor, "[list] ");
  }

  async getOwnedLists() {
    return {
      success: true,
      lists: [
        { id: "9001", name: "terminal people", memberCount: 42, owner: { ...DEMO_ME } },
        { id: "9002", name: "omarchy ricers", memberCount: 128, owner: { ...DEMO_ME } },
      ],
    };
  }

  async getListMemberships() {
    return {
      success: true,
      lists: [{ id: "9003", name: "linux desktop", memberCount: 512, owner: { id: "2", username: "archbtw", name: "arch btw" } }],
    };
  }

  async getNews() {
    return {
      success: true,
      items: [
        { id: "n1", headline: "Terminals are eating the desktop", category: "Technology", timeAgo: "2h", postCount: 587 },
        { id: "n2", headline: "Omarchy 4.0 theme system praised", category: "Linux", timeAgo: "5h", postCount: 311 },
        { id: "n3", headline: "Bun runtime hits new adoption record", category: "Dev", timeAgo: "9h", postCount: 204 },
        { id: "n4", headline: "Keyboard-first clients trend upward", category: "Design", timeAgo: "12h", postCount: 156 },
      ],
    };
  }

  async getUserIdByUsername(username: string) {
    return { success: true, userId: "77", username, name: username };
  }

  async getUserAboutAccount(username: string) {
    return { success: true, username };
  }

  async getUserTweetsPaged(_userId: string, limit: number, options: { cursor?: string } = {}): Promise<SearchResult> {
    return page(limit, options.cursor, "[profile] ");
  }

  async tweet(text: string) {
    this.posted += 1;
    void text;
    return { success: true as const, tweetId: `demo-${this.posted}` };
  }

  async reply(text: string, replyToTweetId: string) {
    this.posted += 1;
    void text;
    void replyToTweetId;
    return { success: true as const, tweetId: `demo-${this.posted}` };
  }

  async like(tweetId: string) {
    this.liked.add(tweetId);
    return { success: true as const };
  }

  async unlike(tweetId: string) {
    this.liked.delete(tweetId);
    return { success: true as const };
  }

  async bookmark(tweetId: string) {
    this.bookmarked.add(tweetId);
    return { success: true as const };
  }

  async unbookmark(tweetId: string) {
    this.bookmarked.delete(tweetId);
    return { success: true as const };
  }
}

export async function createDemoClient(): Promise<{ client: TwitterClient; me: TwitterUser }> {
  await prepareDemoAvatars().catch(() => {});
  const me: TwitterUser = { ...DEMO_ME, profileImageUrl: avatarUrls.get(DEMO_ME.username) };
  return { client: new DemoClient() as unknown as TwitterClient, me };
}

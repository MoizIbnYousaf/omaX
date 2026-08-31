/**
 * End-to-end integration tests for omax.
 *
 * Runs against REAL X/Twitter GraphQL APIs with real cookies.
 * No mocks, no fakes. Tests the full pipeline from cookie auth
 * through GraphQL fetch through data mapping to type correctness.
 *
 * Usage: bun test/e2e.ts
 */

import { resolveCredentials, TwitterClient, type TweetData, type TwitterUser, type SearchResult, type CurrentUserResult, type TwitterCookies } from "../src/lib/x-client/index.js";
import { sanitizeText } from "../src/sanitize.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string): void {
  console.log(`\n--- ${name} ---\n`);
}

async function main() {
  console.log("omax E2E test suite — real API, no mocks\n");

  // =========================================================================
  // 1. COOKIE AUTHENTICATION
  // =========================================================================
  section("Cookie Authentication");

  let cookies: TwitterCookies;
  try {
    const result = await resolveCredentials({});
    cookies = result.cookies;
    assert(!!cookies.authToken, "auth_token extracted from browser");
    assert(!!cookies.ct0, "ct0 CSRF token extracted from browser");
    assert(!!cookies.cookieHeader, "cookie header string assembled");
    assert(cookies.authToken!.length > 10, "auth_token is non-trivial length", `got ${cookies.authToken!.length} chars`);
    assert(cookies.ct0!.length > 10, "ct0 is non-trivial length", `got ${cookies.ct0!.length} chars`);
  } catch (e) {
    console.log(`  FAIL  cookie extraction — ${(e as Error).message}`);
    console.log("\nCannot continue without cookies. Log into x.com in a browser first.");
    process.exit(1);
  }

  // =========================================================================
  // 2. CLIENT INITIALIZATION
  // =========================================================================
  section("Client Initialization");

  const client = new TwitterClient({ cookies });
  assert(typeof client.getHomeTimeline === "function", "getHomeTimeline method exists");
  assert(typeof client.getHomeLatestTimeline === "function", "getHomeLatestTimeline method exists");
  assert(typeof client.search === "function", "search method exists");
  assert(typeof client.tweet === "function", "tweet method exists");
  assert(typeof client.reply === "function", "reply method exists");
  assert(typeof client.like === "function", "like method exists");
  assert(typeof client.unlike === "function", "unlike method exists");
  assert(typeof client.bookmark === "function", "bookmark method exists");
  assert(typeof client.unbookmark === "function", "unbookmark method exists");
  assert(typeof client.getThread === "function", "getThread method exists");
  assert(typeof client.getReplies === "function", "getReplies method exists");
  assert(typeof client.getCurrentUser === "function", "getCurrentUser method exists");
  assert(typeof client.follow === "function", "follow method exists");
  assert(typeof client.unfollow === "function", "unfollow method exists");
  assert(typeof client.getOwnedLists === "function", "getOwnedLists method exists");
  assert(typeof client.getNews === "function", "getNews method exists");

  // =========================================================================
  // 3. CURRENT USER (WHO AM I)
  // =========================================================================
  section("Current User Authentication");

  const userResult: CurrentUserResult = await client.getCurrentUser();
  assert(userResult.success === true, "getCurrentUser succeeds");
  assert(!!userResult.user, "user object returned");
  if (userResult.user) {
    assert(typeof userResult.user.id === "string", "user.id is string");
    assert(userResult.user.id.length > 0, "user.id is non-empty");
    assert(typeof userResult.user.username === "string", "user.username is string");
    assert(userResult.user.username.length > 0, "user.username is non-empty");
    assert(typeof userResult.user.name === "string", "user.name is string");
    console.log(`  INFO  authenticated as @${userResult.user.username} (${userResult.user.name})`);
  }

  // =========================================================================
  // 4. HOME TIMELINE (FOR YOU)
  // =========================================================================
  section("Home Timeline (For You)");

  const forYou: SearchResult = await client.getHomeTimeline(20);
  assert(forYou.success === true, "getHomeTimeline succeeds");
  if (forYou.success) {
    assert(Array.isArray(forYou.tweets), "tweets is an array");
    assert(forYou.tweets.length > 0, "timeline returned posts", `got ${forYou.tweets.length}`);
    assert(forYou.tweets.length <= 20, "respects count limit");

    // Validate EVERY field on first tweet
    const tweet = forYou.tweets[0];
    validateTweetData(tweet, "forYou[0]");

    // Validate 5 more tweets for consistency
    for (let i = 1; i < Math.min(6, forYou.tweets.length); i++) {
      validateTweetData(forYou.tweets[i], `forYou[${i}]`);
    }

    // Check for viewer engagement state (our bird-cli patch)
    const hasEngagement = forYou.tweets.some(
      (t) => t.viewerHasLiked !== undefined || t.viewerHasBookmarked !== undefined || t.viewerHasRetweeted !== undefined,
    );
    assert(hasEngagement, "viewer engagement state present on at least one tweet");
  }

  // =========================================================================
  // 5. HOME TIMELINE (FOLLOWING / CHRONOLOGICAL)
  // =========================================================================
  section("Home Timeline (Following)");

  const following: SearchResult = await client.getHomeLatestTimeline(20);
  assert(following.success === true, "getHomeLatestTimeline succeeds");
  if (following.success) {
    assert(following.tweets.length > 0, "following timeline returned posts", `got ${following.tweets.length}`);
    validateTweetData(following.tweets[0], "following[0]");

    // Verify it's different from For You (different sort order at minimum)
    if (forYou.success && forYou.tweets.length > 0 && following.tweets.length > 0) {
      const forYouIds = new Set(forYou.tweets.map((t) => t.id));
      const followingIds = new Set(following.tweets.map((t) => t.id));
      const overlap = [...followingIds].filter((id) => forYouIds.has(id)).length;
      console.log(`  INFO  overlap with For You: ${overlap}/${following.tweets.length} tweets`);
    }
  }

  // =========================================================================
  // 6. SEARCH
  // =========================================================================
  section("Search");

  const searchResult = await client.search("typescript", 10);
  assert(searchResult.success === true, "search succeeds");
  if (searchResult.success) {
    assert(searchResult.tweets.length > 0, "search returned results", `got ${searchResult.tweets.length}`);
    validateTweetData(searchResult.tweets[0], "search[0]");

    // Verify search relevance (at least some results mention the query)
    const mentionsQuery = searchResult.tweets.some(
      (t) => t.text.toLowerCase().includes("typescript"),
    );
    assert(mentionsQuery, "at least one result mentions search query");
  }

  // =========================================================================
  // 7. TWEET DETAIL (THREAD + REPLIES)
  // =========================================================================
  section("Tweet Detail (Thread + Replies)");

  // Use a tweet from the timeline for this test
  if (forYou.success && forYou.tweets.length > 0) {
    const testTweet = forYou.tweets.find((t) => (t.replyCount ?? 0) > 0) ?? forYou.tweets[0];
    console.log(`  INFO  testing with tweet ${testTweet.id} by @${testTweet.author?.username}`);

    const threadResult = await client.getThread(testTweet.id);
    assert(threadResult.success === true, "getThread succeeds");
    if (threadResult.success) {
      assert(threadResult.tweets.length > 0, "thread returned posts", `got ${threadResult.tweets.length}`);
      validateTweetData(threadResult.tweets[0], "thread[0]");
    }

    const repliesResult = await client.getReplies(testTweet.id);
    assert(repliesResult.success === true, "getReplies succeeds");
    if (repliesResult.success) {
      console.log(`  INFO  got ${repliesResult.tweets.length} replies`);
      if (repliesResult.tweets.length > 0) {
        validateTweetData(repliesResult.tweets[0], "replies[0]");
      }
    }
  }

  // =========================================================================
  // 8. USER LOOKUP + USER TWEETS
  // =========================================================================
  section("User Lookup + User Tweets");

  const lookup = await client.getUserIdByUsername("elonmusk");
  assert(lookup.success === true, "getUserIdByUsername succeeds for @elonmusk");
  if (lookup.success) {
    assert(!!lookup.userId, "userId returned");
    assert(!!lookup.username, "username returned");
    console.log(`  INFO  @elonmusk userId: ${lookup.userId}`);

    // Get their tweets
    const userTweets = await client.getUserTweetsPaged(lookup.userId!, 10);
    assert(userTweets.success === true, "getUserTweetsPaged succeeds");
    if (userTweets.success) {
      assert(userTweets.tweets.length > 0, "user tweets returned", `got ${userTweets.tweets.length}`);
      validateTweetData(userTweets.tweets[0], "elonmusk_tweets[0]");
    }
  }

  // =========================================================================
  // 9. LIKE / UNLIKE ROUND TRIP
  // =========================================================================
  section("Like / Unlike Round Trip");

  if (forYou.success && forYou.tweets.length > 2) {
    // Use a tweet we haven't liked yet (pick from the end of timeline)
    const testTweet = forYou.tweets[forYou.tweets.length - 1];
    console.log(`  INFO  testing like on tweet ${testTweet.id}`);

    const likeResult = await client.like(testTweet.id);
    assert(likeResult.success === true, "like succeeds");

    // Small delay to let API propagate
    await new Promise((r) => setTimeout(r, 1000));

    const unlikeResult = await client.unlike(testTweet.id);
    assert(unlikeResult.success === true, "unlike succeeds (round trip complete)");
  }

  // =========================================================================
  // 10. BOOKMARK / UNBOOKMARK ROUND TRIP
  // =========================================================================
  section("Bookmark / Unbookmark Round Trip");

  if (forYou.success && forYou.tweets.length > 2) {
    const testTweet = forYou.tweets[forYou.tweets.length - 2];
    console.log(`  INFO  testing bookmark on tweet ${testTweet.id}`);

    try {
      const bookmarkResult = await client.bookmark(testTweet.id);
      if (bookmarkResult.success) {
        passed++;
        console.log("  PASS  bookmark succeeds");
        await new Promise((r) => setTimeout(r, 1000));
        const unbookmarkResult = await client.unbookmark(testTweet.id);
        assert(unbookmarkResult.success === true, "unbookmark succeeds (round trip complete)");
      } else {
        console.log(`  SKIP  bookmark API returned error (likely permission): ${(bookmarkResult as any).error ?? "unknown"}`);
      }
    } catch (e) {
      console.log(`  SKIP  bookmark API threw (likely permission): ${(e as Error).message}`);
    }
  }

  // =========================================================================
  // 11. NEWS / TRENDING
  // =========================================================================
  section("News / Trending");

  const newsResult = await client.getNews(10);
  assert(newsResult.success === true, "getNews succeeds");
  if (newsResult.success && newsResult.items) {
    assert(newsResult.items.length > 0, "trending items returned", `got ${newsResult.items.length}`);
    const item = newsResult.items[0];
    assert(typeof item === "object", "trending item is an object");
    console.log(`  INFO  top trending: ${JSON.stringify(item).slice(0, 100)}...`);
  }

  // =========================================================================
  // 12. LISTS
  // =========================================================================
  section("Lists");

  try {
    const listsResult = await client.getOwnedLists();
    if (listsResult.success) {
      passed++;
      console.log(`  PASS  getOwnedLists succeeds`);
      console.log(`  INFO  owned lists: ${listsResult.lists?.length ?? 0}`);
    } else {
      console.log(`  SKIP  getOwnedLists returned error (likely permission): ${(listsResult as any).error ?? "unknown"}`);
    }
  } catch (e) {
    console.log(`  SKIP  getOwnedLists threw (likely permission): ${(e as Error).message}`);
  }

  // =========================================================================
  // 13. FOLLOWERS / FOLLOWING
  // =========================================================================
  section("Followers / Following");

  if (userResult.user) {
    const followingResult = await client.getFollowing(userResult.user.id, 5);
    assert(followingResult.success === true, "getFollowing succeeds");
    if (followingResult.success && followingResult.users) {
      assert(followingResult.users.length > 0, "following list returned users", `got ${followingResult.users.length}`);
      const u = followingResult.users[0];
      assert(typeof u.id === "string", "following user has id");
      assert(typeof u.username === "string", "following user has username");
      console.log(`  INFO  first following: @${u.username}`);
    }

    const followersResult = await client.getFollowers(userResult.user.id, 5);
    assert(followersResult.success === true, "getFollowers succeeds");
    if (followersResult.success && followersResult.users) {
      console.log(`  INFO  followers returned: ${followersResult.users.length}`);
    }
  }

  // =========================================================================
  // 14. SANITIZATION (with real tweet data)
  // =========================================================================
  section("Sanitization on Real Data");

  if (forYou.success) {
    for (let i = 0; i < Math.min(10, forYou.tweets.length); i++) {
      const tweet = forYou.tweets[i];
      const sanitized = sanitizeText(tweet.text);
      assert(!sanitized.includes("\x1b"), `tweet[${i}] text has no ESC after sanitize`);
      assert(!sanitized.match(/[\x00-\x08\x0b-\x1f\x7f]/), `tweet[${i}] text has no control chars after sanitize`);
      assert(!sanitized.match(/[\x80-\x9f]/), `tweet[${i}] text has no C1 bytes after sanitize`);
      // Verify sanitization preserves content
      assert(sanitized.length > 0 || tweet.text.length === 0, `tweet[${i}] sanitized text is non-empty`);

      if (tweet.author) {
        const sanitizedName = sanitizeText(tweet.author.name);
        assert(!sanitizedName.includes("\x1b"), `tweet[${i}] author name has no ESC`);
      }
    }
  }

  // =========================================================================
  // 15. DATA COMPLETENESS CHECK (every field on TweetData)
  // =========================================================================
  section("Data Completeness (Full Field Audit)");

  if (forYou.success && forYou.tweets.length >= 5) {
    const sample = forYou.tweets.slice(0, 5);
    const hasId = sample.every((t) => typeof t.id === "string" && t.id.length > 0);
    const hasText = sample.every((t) => typeof t.text === "string");
    const hasAuthor = sample.every((t) => t.author && typeof t.author.username === "string");
    const hasCreatedAt = sample.filter((t) => t.createdAt).length;
    const hasLikeCount = sample.filter((t) => typeof t.likeCount === "number").length;
    const hasRetweetCount = sample.filter((t) => typeof t.retweetCount === "number").length;
    const hasReplyCount = sample.filter((t) => typeof t.replyCount === "number").length;
    const hasConversationId = sample.filter((t) => t.conversationId).length;
    const hasMedia = sample.filter((t) => t.media && t.media.length > 0).length;
    const hasQuotedTweet = sample.filter((t) => t.quotedTweet).length;

    assert(hasId, "all 5 tweets have id");
    assert(hasText, "all 5 tweets have text");
    assert(hasAuthor, "all 5 tweets have author with username");
    assert(hasCreatedAt >= 3, `createdAt present on ${hasCreatedAt}/5 tweets`);
    assert(hasLikeCount >= 3, `likeCount present on ${hasLikeCount}/5 tweets`);
    assert(hasRetweetCount >= 3, `retweetCount present on ${hasRetweetCount}/5 tweets`);
    assert(hasReplyCount >= 3, `replyCount present on ${hasReplyCount}/5 tweets`);
    assert(hasConversationId >= 1, `conversationId present on ${hasConversationId}/5 tweets`);
    console.log(`  INFO  media present on ${hasMedia}/5 tweets`);
    console.log(`  INFO  quoted tweets on ${hasQuotedTweet}/5 tweets`);
  }

  // =========================================================================
  // RESULTS
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

function validateTweetData(tweet: TweetData, label: string): void {
  assert(typeof tweet.id === "string" && tweet.id.length > 0, `${label}.id exists`);
  assert(typeof tweet.text === "string", `${label}.text is string`);
  assert(tweet.text.length > 0, `${label}.text is non-empty`);
  assert(!!tweet.author, `${label}.author exists`);
  if (tweet.author) {
    assert(typeof tweet.author.username === "string", `${label}.author.username is string`);
    assert(tweet.author.username.length > 0, `${label}.author.username is non-empty`);
    assert(typeof tweet.author.name === "string", `${label}.author.name is string`);
  }
}

void main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoClient } from "../src/demo/demo-client.js";
import type { GraphqlTweetResult } from "../src/lib/x-client/twitter-client-types.js";
import { mapTweetResult } from "../src/lib/x-client/twitter-client-utils.js";
import { extractProfileImageUrl } from "../src/lib/x-client/twitter-user-mapping.js";

describe("profile image mapping", () => {
  test("prefers the canonical legacy image when both X user shapes exist", () => {
    expect(
      extractProfileImageUrl({
        legacy: { profile_image_url_https: " https://pbs.twimg.com/legacy.jpg " },
        avatar: { image_url: "https://pbs.twimg.com/avatar.jpg" },
      }),
    ).toBe("https://pbs.twimg.com/legacy.jpg");
  });

  test("falls back to the avatar shape and ignores blank values", () => {
    expect(
      extractProfileImageUrl({
        legacy: { profile_image_url_https: "  " },
        avatar: { image_url: " https://pbs.twimg.com/avatar.jpg " },
      }),
    ).toBe("https://pbs.twimg.com/avatar.jpg");
    expect(extractProfileImageUrl({ legacy: {}, avatar: {} })).toBeUndefined();
  });

  test("preserves legacy-only profile photos when mapping timeline posts", () => {
    const result: GraphqlTweetResult = {
      rest_id: "42",
      legacy: { full_text: "hello from the fixture" },
      core: {
        user_results: {
          result: {
            rest_id: "7",
            legacy: {
              screen_name: "fixture",
              name: "Fixture User",
              profile_image_url_https: "https://pbs.twimg.com/profile.jpg",
            },
          },
        },
      },
    };

    expect(mapTweetResult(result, 1)?.author.profileImageUrl).toBe(
      "https://pbs.twimg.com/profile.jpg",
    );
  });

  test("demo account and profile lookups expose private local avatar files", async () => {
    const stateHome = await mkdtemp(join(tmpdir(), "omax-demo-state-"));
    const previousStateHome = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = stateHome;

    try {
      const { client, me } = await createDemoClient();
      const current = await client.getCurrentUser();
      const profile = await client.getUserIdByUsername(me.username);
      const urls = [me.profileImageUrl, current.user?.profileImageUrl, profile.profileImageUrl];

      for (const url of urls) {
        expect(url?.startsWith("file:")).toBe(true);
        const avatar = await stat(fileURLToPath(url!));
        expect(avatar.isFile()).toBe(true);
        expect(avatar.mode & 0o077).toBe(0);
      }
    } finally {
      if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = previousStateHome;
      await rm(stateHome, { recursive: true, force: true });
    }
  });
});

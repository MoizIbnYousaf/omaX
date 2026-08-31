import { describe, expect, test } from "bun:test";
import {
  fetchImageBuffer,
  isAllowedImageUrl,
  MAX_IMAGE_BYTES,
} from "../src/ui/media/image-fetch.js";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("image fetch policy", () => {
  test("allows only credential-free HTTPS URLs on the fixed X media ports", () => {
    expect(isAllowedImageUrl("https://pbs.twimg.com/profile.png")).toBe(true);
    expect(isAllowedImageUrl("https://pbs.twimg.com:443/profile.png")).toBe(true);
    expect(isAllowedImageUrl("http://pbs.twimg.com/profile.png")).toBe(false);
    expect(isAllowedImageUrl("https://pbs.twimg.com:444/profile.png")).toBe(false);
    expect(isAllowedImageUrl("https://name:secret@pbs.twimg.com/profile.png")).toBe(false);
    expect(isAllowedImageUrl("https://pbs.twimg.com.example.org/profile.png")).toBe(false);
  });

  test("downloads bounded image responses from X media hosts", async () => {
    const fetchImage = async () =>
      new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });

    expect(
      await fetchImageBuffer("https://pbs.twimg.com/profile.png", fetchImage),
    ).toEqual(Buffer.from(PNG_BYTES));
  });

  test("rejects redirects outside the X media allowlist", async () => {
    let requests = 0;
    const fetchImage = async () => {
      requests += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/tracker.png" },
      });
    };

    await expect(
      fetchImageBuffer("https://pbs.twimg.com/profile.png", fetchImage),
    ).rejects.toThrow("outside the X media allowlist");
    expect(requests).toBe(1);
  });

  test("rejects oversized and non-image responses before decoding", async () => {
    const oversized = async () =>
      new Response(PNG_BYTES, {
        headers: {
          "content-length": String(MAX_IMAGE_BYTES + 1),
          "content-type": "image/png",
        },
      });
    const html = async () =>
      new Response("not an image", { headers: { "content-type": "text/html" } });

    await expect(
      fetchImageBuffer("https://pbs.twimg.com/large.png", oversized),
    ).rejects.toThrow("download limit");
    await expect(
      fetchImageBuffer("https://pbs.twimg.com/error.png", html),
    ).rejects.toThrow("unsupported content type");
  });
});

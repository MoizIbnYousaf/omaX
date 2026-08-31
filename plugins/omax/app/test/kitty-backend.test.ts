import { describe, expect, test } from "bun:test";
import { KittyInlineImageBackend } from "../src/ui/media/kitty-backend.js";
import type { InlineImageRequest } from "../src/ui/media/inline-image-backend.js";

function request(imageKey: string, x: number): InlineImageRequest {
  return {
    imageId: "timeline:avatar:post-1",
    imageKey,
    placement: { x, y: 2, width: 4, height: 2, pixelWidth: 32, pixelHeight: 32 },
    asset: {
      cacheKey: imageKey,
      width: 32,
      height: 32,
      pngData: Buffer.from("synthetic-png"),
    },
  };
}

function backendWithRenderer(): {
  backend: KittyInlineImageBackend;
  output: string[];
} {
  const backend = new KittyInlineImageBackend();
  const output: string[] = [];
  const renderer = {
    idle: async () => {},
    writeOut: (chunk: string) => output.push(chunk),
  };
  (backend as unknown as { renderer: typeof renderer }).renderer = renderer;
  return { backend, output };
}

describe("KittyInlineImageBackend", () => {
  test("drains every concurrent graphics write", async () => {
    const { backend, output } = backendWithRenderer();
    await Promise.all([
      backend.show(request("one", 1)),
      backend.update(request("two", 2)),
      backend.update(request("three", 3)),
    ]);
    expect(output).toHaveLength(3);
  });

  test("an older hide never forgets a newer placement", async () => {
    const { backend } = backendWithRenderer();
    await backend.show(request("one", 1));

    const update = backend.update(request("two", 2));
    const hide = backend.hide("timeline:avatar:post-1");
    await Promise.all([update, hide]);

    const placements = (backend as unknown as {
      activePlacements: Map<string, { placementId: number }>;
    }).activePlacements;
    expect(placements.has("timeline:avatar:post-1")).toBe(true);
  });
});

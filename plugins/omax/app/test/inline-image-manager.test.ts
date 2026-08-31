import { describe, expect, test } from "bun:test";
import type { CliRenderer } from "@opentui/core";
import { InlineImageManager } from "../src/ui/media/inline-image-manager.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("InlineImageManager scroll reconciliation", () => {
  test("runs only the latest refresh after renderer layout settles", async () => {
    const idle = deferred();
    const renderer = { idle: () => idle.promise } as unknown as CliRenderer;
    const manager = new InlineImageManager(renderer, "off", () => {});
    const calls: string[] = [];

    manager.reconcileAfterScroll(async () => {
      calls.push("stale");
    });
    manager.reconcileAfterScroll(async () => {
      calls.push("current");
    });

    idle.resolve();
    await idle.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["current"]);
  });

  test("view cleanup cancels a pending refresh", async () => {
    const idle = deferred();
    const renderer = { idle: () => idle.promise } as unknown as CliRenderer;
    const manager = new InlineImageManager(renderer, "off", () => {});
    let refreshed = false;

    manager.reconcileAfterScroll(async () => {
      refreshed = true;
    });
    await manager.clearView("timeline");
    idle.resolve();
    await idle.promise;
    await Promise.resolve();

    expect(refreshed).toBe(false);
  });
});

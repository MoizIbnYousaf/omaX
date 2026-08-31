import type { CliRenderer } from "@opentui/core";
import type { InlineImageBackend, InlineImageRequest } from "./inline-image-backend.js";

const ESC = "\u001b";
const ST = `${ESC}\\`;
const KITTY_DATA_CHUNK_SIZE = 4096;

interface ActivePlacement {
  cacheKey: string;
  kittyImageId: number;
  placementId: number;
}

export class KittyInlineImageBackend implements InlineImageBackend {
  public readonly name = "kitty";

  // Image data transmitted to the terminal, keyed by content cacheKey.
  // Once a PNG is transmitted, we never re-send the bytes — we just create
  // new cheap placements that reference the existing image id.
  private readonly transmittedImageIds = new Map<string, number>();

  // Current placement per logical imageId (e.g., "timeline:avatar:tweetId").
  private readonly activePlacements = new Map<string, ActivePlacement>();

  private nextKittyImageId = 1;
  private nextPlacementId = 1;

  private renderer: CliRenderer | null = null;
  private writeTail: Promise<void> = Promise.resolve();

  public isAvailable(renderer: CliRenderer): boolean {
    const capabilities = renderer.capabilities as Record<string, unknown> | null;
    if (!process.stdout.isTTY) {
      return false;
    }
    if (Boolean(process.env.TMUX)) {
      return false;
    }

    this.renderer = renderer;

    if (capabilities?.kitty_graphics === true) {
      return true;
    }

    const term = (process.env.TERM ?? "").toLowerCase();
    const termProgram = (process.env.TERM_PROGRAM ?? "").toLowerCase();
    if (term.includes("kitty")) {
      return true;
    }
    if (Boolean(process.env.KITTY_WINDOW_ID)) {
      return true;
    }
    if (termProgram.includes("ghostty") || termProgram.includes("wezterm") || termProgram.includes("warp")) {
      return true;
    }

    return false;
  }

  public async show(request: InlineImageRequest): Promise<void> {
    await this.safeWrite(() => this.renderImage(request));
  }

  public async update(request: InlineImageRequest): Promise<void> {
    await this.safeWrite(() => this.renderImage(request));
  }

  public async hide(imageId: string): Promise<void> {
    const placement = this.activePlacements.get(imageId);
    if (!placement) {
      return;
    }
    await this.safeWrite(() => {
      // Delete just the placement and keep the image data on the terminal
      // so a re-show (scroll back into view) is instant.
      this.writeRaw(
        this.formatGraphicsCommand({
          a: "d",
          d: "i",
          i: placement.kittyImageId,
          p: placement.placementId,
          q: 2,
        }),
      );
      const current = this.activePlacements.get(imageId);
      if (current?.placementId === placement.placementId) {
        this.activePlacements.delete(imageId);
      }
    });
  }

  public async clearAll(): Promise<void> {
    await this.safeWrite(() => {
      this.writeRaw(this.formatGraphicsCommand({ a: "d", d: "A", q: 2 }));
      this.activePlacements.clear();
      this.transmittedImageIds.clear();
    });
  }

  private async safeWrite(fn: () => void): Promise<void> {
    const operation = this.writeTail.then(async () => {
      if (this.renderer) {
        try {
          await this.renderer.idle();
        } catch {}
      }
      fn();
    });
    this.writeTail = operation.catch(() => {});
    return operation;
  }

  private renderImage(request: InlineImageRequest): void {
    const cacheKey = request.imageKey;
    const oldPlacement = this.activePlacements.get(request.imageId);

    let kittyImageId = this.transmittedImageIds.get(cacheKey);
    let needsTransmit = false;
    if (kittyImageId === undefined) {
      kittyImageId = this.allocateKittyImageId();
      this.transmittedImageIds.set(cacheKey, kittyImageId);
      needsTransmit = true;
    }

    const reusesPlacement = oldPlacement?.kittyImageId === kittyImageId;
    const newPlacementId = reusesPlacement
      ? oldPlacement.placementId
      : this.nextPlacementId++;
    const parts: string[] = [];

    // Reusing an image/placement id pair makes Kitty move the existing
    // placement instead of creating another one. If the content changed,
    // remove the old pair while retaining its transmitted image data.
    if (oldPlacement && !reusesPlacement) {
      parts.push(
        this.formatGraphicsCommand({
          a: "d",
          d: "i",
          i: oldPlacement.kittyImageId,
          p: oldPlacement.placementId,
          q: 2,
        }),
      );
    }

    // Transmit pixel data only the first time we see this content.
    if (needsTransmit) {
      this.appendTransmitChunks(parts, request.asset.pngData, kittyImageId);
    }

    // Move the existing placement or create one for newly seen content.
    const row = request.placement.y + 1;
    const col = request.placement.x + 1;
    parts.push(`${ESC}7`);
    parts.push(`${ESC}[${row};${col}H`);
    parts.push(
      this.formatGraphicsCommand({
        a: "p",
        i: kittyImageId,
        p: newPlacementId,
        q: 2,
        C: 1,
        c: Math.max(1, request.placement.width),
        r: Math.max(1, request.placement.height),
        z: 10,
      }),
    );
    parts.push(`${ESC}8`);

    this.writeRaw(parts.join(""));

    this.activePlacements.set(request.imageId, {
      cacheKey,
      kittyImageId,
      placementId: newPlacementId,
    });
  }

  private appendTransmitChunks(parts: string[], pngData: Buffer, kittyImageId: number): void {
    const payload = pngData.toString("base64");
    let offset = 0;

    while (offset < payload.length) {
      const chunk = payload.slice(offset, offset + KITTY_DATA_CHUNK_SIZE);
      const hasMore = offset + KITTY_DATA_CHUNK_SIZE < payload.length;

      if (offset === 0) {
        parts.push(
          this.formatGraphicsCommand(
            {
              a: "t", // transmit only — display happens via separate placement
              t: "d", // direct (payload is base64 in the escape)
              f: 100, // PNG
              i: kittyImageId,
              q: 2,
              m: hasMore ? 1 : 0,
            },
            chunk,
          ),
        );
      } else {
        parts.push(
          this.formatGraphicsCommand(
            {
              q: 2,
              m: hasMore ? 1 : 0,
            },
            chunk,
          ),
        );
      }
      offset += KITTY_DATA_CHUNK_SIZE;
    }
  }

  private formatGraphicsCommand(params: Record<string, string | number>, payload?: string): string {
    const serialized = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
    return payload === undefined
      ? `${ESC}_G${serialized}${ST}`
      : `${ESC}_G${serialized};${payload}${ST}`;
  }

  private writeRaw(data: string): void {
    // Route through the renderer's writeOut so our escapes share the same
    // serialized write path as OpenTUI's frame output. Falls back to stdout
    // if the renderer is not yet attached (should not happen in practice).
    const writer = this.renderer as { writeOut?: (chunk: string) => void } | null;
    if (writer && typeof writer.writeOut === "function") {
      writer.writeOut(data);
      return;
    }
    process.stdout.write(data);
  }

  private allocateKittyImageId(): number {
    const id = this.nextKittyImageId;
    this.nextKittyImageId += 1;
    return id;
  }
}

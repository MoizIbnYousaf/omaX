import { Box, InputRenderable, InputRenderableEvents, Text, type KeyEvent } from "@opentui/core";
import { theme } from "../theme.js";
import type { OmaXView, ComposerRequest, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

export class ComposeView implements OmaXView {
  private readonly ctx: ViewContext;
  private readonly request: ComposerRequest;
  private readonly input: InputRenderable;
  private readonly isNewTweet: boolean;
  private submitting = false;
  private enterHandler: (value: string) => void;

  public constructor(ctx: ViewContext, request: ComposerRequest) {
    this.ctx = ctx;
    this.request = request;
    this.isNewTweet = !request.inReplyToPostId;

    this.input = new InputRenderable(ctx.renderer, {
      id: "compose-input",
      width: 70,
      placeholder: this.isNewTweet
        ? "What's happening?"
        : "Write a reply...",
      value: request.defaultText ?? "",
      maxLength: 280,
      backgroundColor: theme.backgroundMuted,
      focusedBackgroundColor: theme.surface,
      textColor: theme.textPrimary,
      cursorColor: theme.accent,
    });

    this.enterHandler = (value: string) => {
      void this.submit(value);
    };
    this.input.on(InputRenderableEvents.ENTER, this.enterHandler);
  }

  public onEnter(): void {
    this.input.focus();
  }

  public onExit(): void {
    this.input.off(InputRenderableEvents.ENTER, this.enterHandler);
  }

  public render(): ViewDescriptor {
    const charCount = ((this.input as { value?: string }).value?.length) ?? 0;

    return {
      title: this.isNewTweet ? "Compose" : "Reply",
      hints: "Enter: post | Esc: cancel",
      content: Box(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        },
        Box(
          {
            width: "80%",
            maxWidth: 60,
            borderStyle: "rounded",
            borderColor: theme.accent,
            backgroundColor: theme.surface,
            padding: 2,
            gap: 1,
            flexDirection: "column",
          },
          Box(
            {
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            },
            Text({ content: this.isNewTweet ? "New Post" : "Reply", fg: theme.textPrimary }),
            Text({ content: `${charCount}/280`, fg: charCount > 260 ? theme.danger : theme.textMuted }),
          ),
          Box({ height: 0 }),
          this.input,
          Box({ height: 0 }),
          Text({
            content: this.submitting
              ? "Posting..."
              : this.isNewTweet
                ? "Press Enter to post your tweet."
                : "Press Enter to send your reply.",
            fg: theme.textMuted,
          }),
        ),
      ),
    };
  }

  public handleKey(key: KeyEvent): boolean {
    if (isKey(key, "escape")) {
      this.ctx.popView();
      return true;
    }
    return false;
  }

  private async submit(text: string): Promise<void> {
    if (this.submitting) return;

    const trimmed = text.trim();
    if (!trimmed) {
      this.ctx.setStatus("Post cannot be empty.");
      return;
    }

    this.submitting = true;
    this.ctx.setStatus(this.isNewTweet ? "Posting..." : "Replying...");

    try {
      if (this.isNewTweet) {
        const result = await this.ctx.client.tweet(trimmed);
        if (!result.success) {
          this.ctx.setStatus(`Post failed: ${"error" in result ? result.error : "unknown error"}`);
          return;
        }
        this.ctx.setStatus("Posted!");
      } else {
        const result = await this.ctx.client.reply(trimmed, this.request.inReplyToPostId);
        if (!result.success) {
          this.ctx.setStatus(`Reply failed: ${"error" in result ? result.error : "unknown error"}`);
          return;
        }
        this.ctx.setStatus("Reply sent!");
      }
      this.ctx.popView();
    } catch (error) {
      this.ctx.setStatus(`Failed: ${(error as Error).message}`);
    } finally {
      this.submitting = false;
    }
  }
}

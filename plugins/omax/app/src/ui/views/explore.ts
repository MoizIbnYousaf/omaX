import { Box, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { NewsItem } from "../../lib/x-client/twitter-client-news.js";
import { sanitizeText } from "../../sanitize.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";

function formatPostCount(count: number | undefined): string {
  if (count == null) {
    return "";
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M posts`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K posts`;
  }
  return `${count} posts`;
}

function renderTrendingCard(item: NewsItem, index: number, selected: boolean) {
  const headline = item.headline ? sanitizeText(item.headline) : "Trending";
  const category = item.category ? sanitizeText(item.category) : "Trending";
  const postCountStr = formatPostCount(item.postCount);
  const description = item.description ? sanitizeText(item.description) : undefined;

  return Box(
    {
      id: `explore-item-${index}`,
      width: "100%",
      borderStyle: "rounded",
      borderColor: selected ? theme.accent : theme.border,
      backgroundColor: selected ? theme.selection : theme.surface,
      padding: 1,
      marginBottom: 1,
      flexDirection: "column",
      gap: 0,
      overflow: "hidden",
    },
    Text({ content: category, fg: theme.textMuted }),
    Text({ content: headline, fg: theme.textPrimary }),
    description ? Text({ content: description, fg: theme.textMuted }) : null,
    postCountStr ? Text({ content: postCountStr, fg: theme.textMuted }) : null,
  );
}

export class ExploreView implements OmaXView {
  private readonly scrollId = "explore-scroll";
  private readonly ctx: ViewContext;
  private items: NewsItem[] = [];
  private selectedIndex = 0;
  private loading = false;

  public constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  public async onEnter(): Promise<void> {
    if (this.items.length === 0) {
      await this.load();
    }
  }

  public render(): ViewDescriptor {
    const title = "Explore";

    if (this.items.length === 0 && this.loading) {
      return {
        title,
        hints: "j/k: navigate | Enter: search topic | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "Loading trending topics...", fg: theme.textMuted }),
        ),
      };
    }

    if (this.items.length === 0) {
      return {
        title,
        hints: "n: load | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "No trending topics found.", fg: theme.textMuted }),
        ),
      };
    }

    const children = this.items.map((item, index) =>
      renderTrendingCard(item, index, index === this.selectedIndex),
    );

    return {
      title,
      hints: "j/k: navigate | Enter: search topic | n: more | q: back",
      content: Box(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          backgroundColor: theme.background,
          paddingLeft: 1,
          paddingRight: 1,
        },
        ScrollBox(
          {
            id: this.scrollId,
            width: "100%",
            maxWidth: layout.contentColumnMaxWidth,
            height: "100%",
            viewportCulling: true,
            rootOptions: {
              backgroundColor: theme.background,
            },
            contentOptions: {
              padding: 1,
            },
          },
          ...children,
        ),
      ),
    };
  }

  public async handleKey(key: KeyEvent): Promise<boolean> {
    if (isKey(key, "j", "down")) {
      this.moveSelection(1);
      return true;
    }

    if (isKey(key, "k", "up")) {
      this.moveSelection(-1);
      return true;
    }

    if (isKey(key, "n")) {
      await this.load();
      return true;
    }

    if (isKey(key, "return", "enter")) {
      const selected = this.items[this.selectedIndex];
      if (selected) {
        const query = selected.headline;
        if (query) {
          this.ctx.setStatus(`Searching for: ${sanitizeText(query)}`);
          try {
            const result = await this.ctx.client.search(sanitizeText(query), 10);
            if (result.success && result.tweets && result.tweets.length > 0) {
              const tweet = result.tweets[0];
              await this.ctx.pushPostDetail({
                tweet,
                author: tweet.author
                  ? {
                      id: tweet.authorId ?? "",
                      username: tweet.author.username,
                      name: tweet.author.name,
                      profileImageUrl: tweet.author.profileImageUrl,
                    }
                  : undefined,
              });
            } else {
              this.ctx.setStatus("No results found for this topic.");
            }
          } catch (error) {
            this.ctx.setStatus(`Search failed: ${(error as Error).message}`);
          }
        }
      }
      return true;
    }

    return false;
  }

  private moveSelection(delta: number): void {
    const nextIndex = Math.max(
      0,
      Math.min(this.items.length - 1, this.selectedIndex + delta),
    );
    this.selectedIndex = nextIndex;
    this.scrollSelectedIntoView();
  }

  private scrollSelectedIntoView(): void {
    const selectedCardId = `explore-item-${this.selectedIndex}`;
    this.scrollSelectedIntoViewWithRetry(selectedCardId, 0);
  }

  private scrollSelectedIntoViewWithRetry(
    selectedCardId: string,
    attempt: number,
  ): void {
    setTimeout(
      () => {
        const scrollBox = this.ctx.renderer.root.findDescendantById(
          this.scrollId,
        ) as
          | {
              scrollChildIntoView?: (childId: string) => void;
              scrollTop?: number;
            }
          | undefined;

        if (!scrollBox?.scrollChildIntoView) {
          if (attempt < 4) {
            this.scrollSelectedIntoViewWithRetry(selectedCardId, attempt + 1);
          }
          return;
        }

        const before = scrollBox.scrollTop;
        scrollBox.scrollChildIntoView(selectedCardId);
        const after = scrollBox.scrollTop;

        if (before === after && attempt < 4) {
          this.scrollSelectedIntoViewWithRetry(selectedCardId, attempt + 1);
        }
      },
      attempt === 0 ? 0 : 16,
    );
  }

  private async load(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.ctx.setStatus("Loading trending topics...");

    try {
      const result = await this.ctx.client.getNews(20);

      if (!result.success) {
        this.ctx.setStatus(`Explore error: ${result.error}`);
        return;
      }

      this.items = result.items;
      this.selectedIndex = 0;
      this.ctx.setStatus(`Loaded ${this.items.length} trending topics.`);
    } catch (error) {
      this.ctx.setStatus(
        `Explore request failed: ${(error as Error).message}`,
      );
    } finally {
      this.loading = false;
    }
  }
}

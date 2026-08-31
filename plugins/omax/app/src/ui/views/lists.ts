import { Box, ScrollBox, Text, type KeyEvent } from "@opentui/core";
import type { TwitterList } from "../../lib/x-client/twitter-client-types.js";
import { sanitizeText } from "../../sanitize.js";
import { layout, theme } from "../theme.js";
import type { OmaXView, ViewContext, ViewDescriptor } from "./contracts.js";
import { isKey } from "./contracts.js";
import { ListTimelineView } from "./list-timeline.js";

function renderListCard(list: TwitterList, index: number, selected: boolean) {
  const name = list.name ? sanitizeText(list.name) : "Unnamed List";
  const description = list.description ? sanitizeText(list.description) : undefined;
  const memberCount = list.memberCount != null ? `${list.memberCount} members` : undefined;
  const ownerLabel = list.owner?.username
    ? `@${sanitizeText(list.owner.username)}`
    : undefined;
  const privateBadge = list.isPrivate ? " [private]" : "";

  return Box(
    {
      id: `list-item-${index}`,
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
    Text({ content: `${name}${privateBadge}`, fg: theme.textPrimary }),
    description ? Text({ content: description, fg: theme.textMuted }) : null,
    Box(
      {
        flexDirection: "row",
        gap: 2,
      },
      memberCount ? Text({ content: memberCount, fg: theme.textMuted }) : null,
      ownerLabel ? Text({ content: ownerLabel, fg: theme.textMuted }) : null,
    ),
  );
}

export class ListsView implements OmaXView {
  private readonly scrollId = "lists-scroll";
  private readonly ctx: ViewContext;
  private items: TwitterList[] = [];
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
    const title = "Lists";

    if (this.items.length === 0 && this.loading) {
      return {
        title,
        hints: "j/k: navigate | Enter: open list | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "Loading lists...", fg: theme.textMuted }),
        ),
      };
    }

    if (this.items.length === 0) {
      return {
        title,
        hints: "n: reload | q: back",
        content: Box(
          {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
          Text({ content: "No lists found.", fg: theme.textMuted }),
        ),
      };
    }

    const children = this.items.map((item, index) =>
      renderListCard(item, index, index === this.selectedIndex),
    );

    return {
      title,
      hints: "j/k: navigate | Enter: open list | n: reload | q: back",
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
        const listName = selected.name ? sanitizeText(selected.name) : "List";
        const view = new ListTimelineView(this.ctx, selected.id, listName);
        this.ctx.replaceView(view);
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
    const selectedCardId = `list-item-${this.selectedIndex}`;
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
    this.ctx.setStatus("Loading lists...");

    try {
      const [ownedResult, memberResult] = await Promise.all([
        this.ctx.client.getOwnedLists(),
        this.ctx.client.getListMemberships(),
      ]);

      const allLists: TwitterList[] = [];
      const seenIds = new Set<string>();

      if (ownedResult.success && ownedResult.lists) {
        for (const list of ownedResult.lists) {
          if (!seenIds.has(list.id)) {
            seenIds.add(list.id);
            allLists.push(list);
          }
        }
      }

      if (memberResult.success && memberResult.lists) {
        for (const list of memberResult.lists) {
          if (!seenIds.has(list.id)) {
            seenIds.add(list.id);
            allLists.push(list);
          }
        }
      }

      if (allLists.length === 0) {
        const error = ownedResult.error || memberResult.error;
        this.ctx.setStatus(error ? `Lists error: ${error}` : "No lists found.");
      } else {
        this.ctx.setStatus(`Loaded ${allLists.length} lists.`);
      }

      this.items = allLists;
      this.selectedIndex = 0;
    } catch (error) {
      this.ctx.setStatus(
        `Lists request failed: ${(error as Error).message}`,
      );
    } finally {
      this.loading = false;
    }
  }
}

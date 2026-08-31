import { Box, CliRenderEvents, type CliRenderer, type KeyEvent } from "@opentui/core";
import type { TwitterClient, TwitterUser } from "../lib/x-client/index.js";
import type { ImageMode, ExpandedTweet } from "../types.js";
import { renderHeaderBar, renderStatusBar } from "./components/index.js";
import { renderRightPanel, type TrendingItem } from "./components/right-panel.js";
import { renderSidebar, type SidebarItem } from "./components/sidebar.js";
import { InlineImageManager } from "./media/inline-image-manager.js";
import { theme } from "./theme.js";
import { ComposeView } from "./views/compose.js";
import { isKey, type OmaXView, type ComposerRequest, type ViewContext } from "./views/contracts.js";
import { BookmarksView } from "./views/bookmarks.js";
import { ExploreView } from "./views/explore.js";
import { ListsView } from "./views/lists.js";
import { PostDetailView } from "./views/post-detail.js";
import { SearchView } from "./views/search.js";
import { ProfileJumpView } from "./views/profile-jump.js";
import { ProfileView } from "./views/profile.js";
import { TimelineView } from "./views/timeline.js";

const SIDEBAR_NAV_MAP: Record<string, SidebarItem> = {
  "1": "home",
  "2": "explore",
  "3": "notifications",
  "4": "bookmarks",
  "5": "lists",
  "6": "profile",
};

const SIDEBAR_WIDTH = 18;
const RIGHT_PANEL_WIDTH = 26;
const THREE_PANE_MIN_WIDTH = 108;
const TWO_PANE_MIN_WIDTH = 68;

export class OmaXApp {
  private readonly renderer: CliRenderer;
  private readonly client: TwitterClient;
  private readonly me: TwitterUser;
  private readonly views: OmaXView[] = [];
  private readonly likedPostIds = new Set<string>();
  private readonly bookmarkedPostIds = new Set<string>();
  private activeSidebar: SidebarItem = "home";
  private trendingItems: TrendingItem[] = [];
  private statusMessage = "Ready";
  private handlingKey = false;
  private renderCycle = 0;
  private readonly keyHandler: (key: KeyEvent) => void;
  private readonly rendererRefreshHandler: () => void;
  private readonly viewContext: ViewContext;

  public constructor(renderer: CliRenderer, client: TwitterClient, me: TwitterUser, imageMode: ImageMode) {
    this.renderer = renderer;
    this.client = client;
    this.me = me;
    const inlineImageManager = new InlineImageManager(this.renderer, imageMode, (message) => {
      this.statusMessage = message;
    });

    this.viewContext = {
      renderer: this.renderer,
      inlineImageManager,
      client: this.client,
      me: this.me,
      setStatus: (message) => {
        this.statusMessage = message;
      },
      pushPostDetail: async (post) => this.pushView(new PostDetailView(this.viewContext, post)),
      pushProfile: async (username) => this.pushView(new ProfileView(this.viewContext, username)),
      pushComposer: async (request) => this.pushView(new ComposeView(this.viewContext, request)),
      popView: () => {
        void this.popView();
      },
      replaceView: (view) => {
        void this.replaceCurrentView(view);
      },
      toggleLike: async (postId) => this.toggleLike(postId),
      toggleBookmark: async (postId) => this.toggleBookmark(postId),
      isLiked: (postId) => this.likedPostIds.has(postId),
      isBookmarked: (postId) => this.bookmarkedPostIds.has(postId),
    };

    this.keyHandler = (key: KeyEvent) => {
      void this.handleKeyPress(key);
    };
    this.rendererRefreshHandler = () => {
      this.render();
    };
  }

  public async start(): Promise<void> {
    this.renderer.disableStdoutInterception();
    this.renderer.on(CliRenderEvents.RESIZE, this.rendererRefreshHandler);
    this.renderer.on(CliRenderEvents.CAPABILITIES, this.rendererRefreshHandler);
    await this.pushView(new TimelineView(this.viewContext));
    this.renderer.keyInput.on("keypress", this.keyHandler);
    this.loadTrending();
  }

  public async stop(): Promise<void> {
    this.renderer.keyInput.off("keypress", this.keyHandler);
    this.renderer.off(CliRenderEvents.RESIZE, this.rendererRefreshHandler);
    this.renderer.off(CliRenderEvents.CAPABILITIES, this.rendererRefreshHandler);
    for (const view of this.views) {
      await view.onExit?.();
    }
    this.views.length = 0;
    await this.viewContext.inlineImageManager.clearAll();
    this.clearRoot();
  }

  private async pushView(view: OmaXView): Promise<void> {
    await this.viewContext.inlineImageManager.clearAll();
    this.views.push(view);
    await view.onEnter();
    this.render();
  }

  private async popView(): Promise<void> {
    if (this.views.length <= 1) {
      await this.stop();
      this.renderer.destroy();
      return;
    }

    const current = this.views.pop();
    await current?.onExit?.();
    this.render();
  }

  private async replaceCurrentView(view: OmaXView): Promise<void> {
    await this.viewContext.inlineImageManager.clearAll();
    if (this.views.length > 0) {
      const current = this.views.pop();
      await current?.onExit?.();
    }
    this.views.push(view);
    await view.onEnter();
    this.render();
  }

  private currentView(): OmaXView | undefined {
    return this.views[this.views.length - 1];
  }

  private getTerminalWidth(): number {
    return this.renderer.terminalWidth || this.renderer.width || 80;
  }

  /** Re-render with the current (possibly re-themed) palette. Used by the
   *  Omarchy theme watcher so omaX re-rices live, like terminals do. */
  public retheme(): void {
    this.render();
  }

  private render(): void {
    const view = this.currentView();
    if (!view) {
      return;
    }
    this.renderCycle += 1;
    const cycle = this.renderCycle;

    const descriptor = view.render();
    this.clearRoot();

    const termWidth = this.getTerminalWidth();
    const showSidebar = termWidth >= TWO_PANE_MIN_WIDTH;
    const showRightPanel = termWidth >= THREE_PANE_MIN_WIDTH;
    const contentWidth = Math.max(
      1,
      termWidth - (showSidebar ? SIDEBAR_WIDTH : 0) - (showRightPanel ? RIGHT_PANEL_WIDTH : 0),
    );

    const contentColumn = Box(
      {
        id: "content-column",
        flexGrow: 1,
        height: "100%",
        flexDirection: "column",
        backgroundColor: theme.background,
      },
      renderHeaderBar(descriptor.title, contentWidth),
      Box(
        {
          id: "shell-content",
          width: "100%",
          flexGrow: 1,
          backgroundColor: theme.background,
        },
        descriptor.content as ReturnType<typeof Box>,
      ),
      renderStatusBar(this.statusMessage, descriptor.hints, contentWidth),
    );

    this.renderer.root.add(
      Box(
        {
          id: "omax-shell",
          width: "100%",
          height: "100%",
          flexDirection: "row",
          backgroundColor: theme.background,
        },
        showSidebar
          ? renderSidebar({ active: this.activeSidebar, username: this.me.username })
          : null,
        contentColumn,
        showRightPanel
          ? renderRightPanel({ trending: this.trendingItems })
          : null,
      ),
    );

    void this.renderer.idle().then(async () => {
      if (cycle !== this.renderCycle || this.currentView() !== view) {
        return;
      }
      await view.onDidRender?.();
    }).catch((error) => {
      this.statusMessage = `Error: ${(error as Error).message}`;
      this.render();
    });
  }

  private clearRoot(): void {
    for (const child of this.renderer.root.getChildren()) {
      child.destroyRecursively();
    }
  }

  private async handleKeyPress(key: KeyEvent): Promise<void> {
    if (this.handlingKey) {
      return;
    }
    this.handlingKey = true;

    try {
      const globalHandled = await this.handleGlobalKey(key);
      if (globalHandled) {
        this.render();
        return;
      }

      const view = this.currentView();
      if (!view) {
        return;
      }

      const handled = await view.handleKey(key);
      if (handled) {
        this.render();
      }
    } catch (error) {
      this.statusMessage = `Error: ${(error as Error).message}`;
      this.render();
    } finally {
      this.handlingKey = false;
    }
  }

  private async handleGlobalKey(key: KeyEvent): Promise<boolean> {
    const sidebarTarget = SIDEBAR_NAV_MAP[key.name];
    if (sidebarTarget && sidebarTarget !== this.activeSidebar) {
      await this.navigateToSidebar(sidebarTarget);
      return true;
    }

    if (key.sequence === "/" && !(this.currentView() instanceof SearchView)) {
      await this.pushView(new SearchView(this.viewContext));
      return true;
    }

    if (this.isProfileJumpShortcut(key)) {
      if (!(this.currentView() instanceof ProfileJumpView)) {
        await this.pushView(new ProfileJumpView(this.viewContext));
      }
      return true;
    }

    if (key.name === "q" || key.name === "escape") {
      await this.popView();
      return true;
    }
    return false;
  }

  private async navigateToSidebar(target: SidebarItem): Promise<void> {
    this.activeSidebar = target;
    let view: OmaXView;

    switch (target) {
      case "home":
        view = new TimelineView(this.viewContext);
        break;
      case "profile":
        view = new ProfileView(this.viewContext, this.me.username);
        break;
      case "explore":
        view = new ExploreView(this.viewContext);
        break;
      case "lists":
        view = new ListsView(this.viewContext);
        break;
      case "bookmarks":
        view = new BookmarksView(this.viewContext);
        break;
      case "notifications":
        this.statusMessage = "Notifications coming soon";
        view = new TimelineView(this.viewContext);
        break;
    }

    while (this.views.length > 0) {
      const v = this.views.pop();
      await v?.onExit?.();
    }
    await this.viewContext.inlineImageManager.clearAll();
    this.views.push(view);
    await view.onEnter();
  }

  private isProfileJumpShortcut(key: KeyEvent): boolean {
    const hasCommandModifier = key.meta || key.super;
    if (!hasCommandModifier) {
      return false;
    }
    return isKey(key, "k", "p");
  }

  private loadTrending(): void {
    void (async () => {
      try {
        const result = await this.client.getNews(8);
        if (result.success && result.items) {
          this.trendingItems = result.items.map((item: any) => ({
            category: item.category,
            topic: item.topic || item.title || "Trending",
            postCount: item.postCount,
          }));
          this.render();
        }
      } catch {
        // Trending is non-critical, fail silently
      }
    })();
  }

  private async toggleLike(postId: string): Promise<boolean> {
    if (this.likedPostIds.has(postId)) {
      const result = await this.client.unlike(postId);
      if (result.success) {
        this.likedPostIds.delete(postId);
      }
      return false;
    }
    const result = await this.client.like(postId);
    if (result.success) {
      this.likedPostIds.add(postId);
    }
    return true;
  }

  private async toggleBookmark(postId: string): Promise<boolean> {
    if (this.bookmarkedPostIds.has(postId)) {
      const result = await this.client.unbookmark(postId);
      if (result.success) {
        this.bookmarkedPostIds.delete(postId);
      }
      return false;
    }
    const result = await this.client.bookmark(postId);
    if (result.success) {
      this.bookmarkedPostIds.add(postId);
    }
    return true;
  }
}

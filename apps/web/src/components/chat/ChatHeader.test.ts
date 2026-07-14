// FILE: ChatHeader.test.ts
// Purpose: Covers chat header presentation helpers that choose thread identity chrome.
// Layer: Component unit tests
// Depends on: ChatHeader pure helpers and Vitest assertions.

import { describe, expect, it } from "vitest";

import { ThreadId } from "@synara/contracts";

import { resolveChatHeaderThreadIconKind, resolveVisibleConversationTabs } from "./ChatHeader";

const chatTab = (id: string, title: string) => ({
  id: ThreadId.makeUnsafe(id),
  title,
  provider: "codex" as const,
});

describe("resolveChatHeaderThreadIconKind", () => {
  it("uses the terminal icon for terminal-first threads", () => {
    expect(resolveChatHeaderThreadIconKind("terminal", "New terminal")).toBe("terminal");
  });

  it("keeps provider branding for chat-first threads", () => {
    expect(resolveChatHeaderThreadIconKind("chat", "Fix auth flow")).toBe("provider");
  });

  it("hides provider branding for untouched new chat threads", () => {
    expect(resolveChatHeaderThreadIconKind("chat", "New thread")).toBe("none");
  });
});

describe("resolveVisibleConversationTabs", () => {
  it("shows every available conversation for a worktree workspace", () => {
    const availableTabs = [chatTab("thread-1", "First"), chatTab("thread-2", "Second")];

    expect(
      resolveVisibleConversationTabs({
        workspaceScoped: true,
        availableTabs,
        openTabs: [availableTabs[0]!],
        activeTab: availableTabs[0]!,
        activeSurface: "chat",
      }),
    ).toEqual(availableTabs);
  });

  it("keeps the active workspace conversation visible while summaries hydrate", () => {
    const activeTab = chatTab("thread-new", "New chat");

    expect(
      resolveVisibleConversationTabs({
        workspaceScoped: true,
        availableTabs: [],
        openTabs: [],
        activeTab,
        activeSurface: "chat",
      }),
    ).toEqual([activeTab]);
  });

  it("preserves explicitly opened tabs outside a worktree workspace", () => {
    const availableTabs = [chatTab("thread-1", "Renamed")];
    const openTab = chatTab("thread-1", "Old name");

    expect(
      resolveVisibleConversationTabs({
        workspaceScoped: false,
        availableTabs,
        openTabs: [openTab],
        activeTab: availableTabs[0]!,
        activeSurface: "chat",
      }),
    ).toEqual(availableTabs);
  });
});

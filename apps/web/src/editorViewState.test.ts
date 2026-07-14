// FILE: editorViewState.test.ts
// Purpose: Verifies project/worktree-scoped editor rail chat persistence.
// Layer: Web UI state persistence tests

import { ThreadId } from "@synara/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readEditorRailActiveChat, storeEditorRailActiveChat } from "./editorViewState";

function installMemoryWindow() {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        entries.set(key, value);
      }),
    },
  });
}

describe("editor rail active chat persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers the active chat independently for each project or worktree", () => {
    installMemoryWindow();
    const firstThreadId = ThreadId.makeUnsafe("thread-first");
    const secondThreadId = ThreadId.makeUnsafe("thread-second");
    const replacementThreadId = ThreadId.makeUnsafe("thread-replacement");

    storeEditorRailActiveChat("workspace:alpha", firstThreadId);
    storeEditorRailActiveChat("project:beta", secondThreadId);
    storeEditorRailActiveChat("workspace:alpha", replacementThreadId);

    expect(readEditorRailActiveChat("workspace:alpha")).toBe(replacementThreadId);
    expect(readEditorRailActiveChat("project:beta")).toBe(secondThreadId);
    expect(readEditorRailActiveChat("workspace:missing")).toBeNull();
  });

  it("ignores malformed persisted preferences", () => {
    installMemoryWindow();
    window.localStorage.setItem(
      "synara.editor.railActiveChatByScopeId",
      JSON.stringify({
        "workspace:valid": { threadId: "thread-valid", updatedAt: 1 },
        "workspace:missing-time": { threadId: "thread-invalid" },
        "workspace:bad-thread": { threadId: 42, updatedAt: 2 },
      }),
    );

    expect(readEditorRailActiveChat("workspace:valid")).toBe("thread-valid");
    expect(readEditorRailActiveChat("workspace:missing-time")).toBeNull();
    expect(readEditorRailActiveChat("workspace:bad-thread")).toBeNull();
  });
});

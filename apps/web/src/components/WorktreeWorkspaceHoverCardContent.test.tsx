// FILE: WorktreeWorkspaceHoverCardContent.test.tsx
// Purpose: Covers worktree hover-card metadata and active conversation wording.
// Layer: Component unit tests

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  formatOpenConversationCount,
  WorktreeWorkspaceHoverCardContent,
} from "./WorktreeWorkspaceHoverCardContent";

describe("formatOpenConversationCount", () => {
  it("makes the active-only meaning explicit", () => {
    expect(formatOpenConversationCount(0)).toBe("No open conversations");
    expect(formatOpenConversationCount(1)).toBe("1 open conversation");
    expect(formatOpenConversationCount(2)).toBe("2 open conversations");
  });
});

describe("WorktreeWorkspaceHoverCardContent", () => {
  it("links the branch while keeping lower-level worktree metadata secondary", () => {
    const markup = renderToStaticMarkup(
      <WorktreeWorkspaceHoverCardContent
        title="Seller catalog"
        branch="synara/seller-catalog"
        branchUrl="https://github.com/example/repo/tree/synara/seller-catalog"
        path="~/.synara/worktrees/seller-catalog"
        source="main"
        status="ready"
        openConversationCount={2}
        onOpenBranch={() => undefined}
      />,
    );

    expect(markup).toContain("Seller catalog");
    expect(markup).toContain('aria-label="Open synara/seller-catalog on GitHub"');
    expect(markup).toContain("~/.synara/worktrees/seller-catalog");
    expect(markup).toContain("2 open conversations");
  });
});

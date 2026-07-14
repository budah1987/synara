import { describe, expect, it } from "vitest";

import { branchNameFromWorkspaceTitle } from "./WorktreeWorkspaceRenameDialog";

describe("branchNameFromWorkspaceTitle", () => {
  it("preserves the current namespace and creates a readable slug", () => {
    expect(branchNameFromWorkspaceTitle("Shipping Details", "synara/old-name")).toBe(
      "synara/shipping-details",
    );
  });

  it("keeps unnamespaced branches unnamespaced", () => {
    expect(branchNameFromWorkspaceTitle("Fix checkout", "old-name")).toBe("fix-checkout");
  });

  it("preserves a nested branch namespace", () => {
    expect(branchNameFromWorkspaceTitle("Shipping details", "users/amir/old-name")).toBe(
      "users/amir/shipping-details",
    );
  });
});

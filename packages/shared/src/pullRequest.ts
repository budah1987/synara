import type {
  OrchestrationThreadPullRequest,
  OrchestrationWorktreeWorkspace,
} from "@synara/contracts";

export interface CanonicalPullRequestIdentity {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export type WorkspaceGitPresentationState =
  | "unavailable"
  | "provisioning"
  | "local-only"
  | "published"
  | "pr-open"
  | "pr-closed"
  | "pr-merged";

export function canonicalPullRequestIdentity(
  pr: Pick<OrchestrationThreadPullRequest, "number" | "url">,
): CanonicalPullRequestIdentity | null {
  try {
    const url = new URL(pr.url);
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i.exec(url.pathname);
    if (!match) return null;
    const owner = match[1]?.trim().toLowerCase() ?? "";
    const repo =
      match[2]
        ?.replace(/\.git$/i, "")
        .trim()
        .toLowerCase() ?? "";
    const number = Number.parseInt(match[3] ?? "", 10);
    if (!owner || !repo || !Number.isSafeInteger(number) || number <= 0 || number !== pr.number) {
      return null;
    }
    return { host: url.hostname.toLowerCase(), owner, repo, number };
  } catch {
    return null;
  }
}

export function pullRequestsMatch(
  left: Pick<OrchestrationThreadPullRequest, "number" | "url">,
  right: Pick<OrchestrationThreadPullRequest, "number" | "url">,
): boolean {
  const leftCanonical = canonicalPullRequestIdentity(left);
  const rightCanonical = canonicalPullRequestIdentity(right);
  if (leftCanonical && rightCanonical) {
    return (
      leftCanonical.host === rightCanonical.host &&
      leftCanonical.owner === rightCanonical.owner &&
      leftCanonical.repo === rightCanonical.repo &&
      leftCanonical.number === rightCanonical.number
    );
  }
  return (
    left.number === right.number &&
    left.url.trim().replace(/\/$/, "") === right.url.trim().replace(/\/$/, "")
  );
}

export function findWorkspaceForPullRequest(
  workspaces: readonly OrchestrationWorktreeWorkspace[],
  projectId: string,
  pr: Pick<OrchestrationThreadPullRequest, "number" | "url">,
): OrchestrationWorktreeWorkspace | null {
  return (
    workspaces.find(
      (workspace) =>
        workspace.projectId === projectId &&
        workspace.deletedAt === null &&
        ((workspace.lastKnownPr !== null && pullRequestsMatch(workspace.lastKnownPr, pr)) ||
          workspace.sourceRef?.trim().replace(/\/$/, "") === pr.url.trim().replace(/\/$/, "")),
    ) ?? null
  );
}

export function deriveWorkspaceGitPresentationState(input: {
  readonly workspaceState: OrchestrationWorktreeWorkspace["state"];
  readonly hasBranch: boolean;
  readonly published: boolean;
  readonly pr: OrchestrationThreadPullRequest | null;
}): WorkspaceGitPresentationState {
  if (input.workspaceState === "provisioning") return "provisioning";
  if (!input.hasBranch || input.workspaceState === "missing" || input.workspaceState === "error") {
    return "unavailable";
  }
  if (input.pr?.state === "merged") return "pr-merged";
  if (input.pr?.state === "closed") return "pr-closed";
  if (input.pr?.state === "open") return "pr-open";
  return input.published ? "published" : "local-only";
}

export function presentPullRequestState(
  pr: Pick<OrchestrationThreadPullRequest, "state" | "isDraft" | "mergeability">,
): string {
  if (pr.state === "merged") return "Merged";
  if (pr.state === "closed") return "Closed";
  if (pr.isDraft === true) return "Draft PR";
  if (pr.mergeability === "conflicting") return "Conflicts";
  return "PR open";
}

export function contextualWorkspaceGitAction(state: WorkspaceGitPresentationState): {
  readonly label: string | null;
  readonly available: boolean;
} {
  switch (state) {
    case "local-only":
      return { label: "Publish branch", available: true };
    case "published":
      return { label: "Create pull request", available: true };
    case "pr-open":
    case "pr-closed":
    case "pr-merged":
      return { label: "View pull request", available: true };
    default:
      return { label: null, available: false };
  }
}

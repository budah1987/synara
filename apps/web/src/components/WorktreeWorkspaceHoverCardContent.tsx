// FILE: WorktreeWorkspaceHoverCardContent.tsx
// Purpose: Compact metadata card for a worktree row in the Projects sidebar.
// Layer: Sidebar UI component

import type { MouseEvent } from "react";

import { ExternalLinkIcon, MessageCircleIcon, WorktreeIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  SIDEBAR_HOVER_CARD_CONTAINER_PADDING_CLASS_NAME,
  SIDEBAR_HOVER_CARD_ROW_CLASS_NAME,
  SIDEBAR_HOVER_CARD_ROW_PADDING_CLASS_NAME,
} from "./sidebarHoverCardStyles";

export type WorktreeWorkspaceHoverCardContentProps = {
  title: string;
  branch: string | null;
  branchUrl: string | null;
  path: string | null;
  source: string;
  status: string;
  openConversationCount: number;
  onOpenBranch: (event: MouseEvent<HTMLAnchorElement>, branchUrl: string) => void;
};

const META_ROW_CLASS_NAME = cn(
  "grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-2 rounded-md",
  SIDEBAR_HOVER_CARD_ROW_PADDING_CLASS_NAME,
  "text-[length:var(--app-font-size-ui-sm,11px)] leading-none",
);

const META_LABEL_CLASS_NAME = "text-muted-foreground/60";
const META_VALUE_CLASS_NAME = "min-w-0 truncate text-foreground/82";

export function formatOpenConversationCount(count: number): string {
  if (count === 0) {
    return "No open conversations";
  }
  return `${count} open ${count === 1 ? "conversation" : "conversations"}`;
}

export function WorktreeWorkspaceHoverCardContent({
  title,
  branch,
  branchUrl,
  path,
  source,
  status,
  openConversationCount,
  onOpenBranch,
}: WorktreeWorkspaceHoverCardContentProps) {
  const branchLabel = branch ?? "Waiting for worktree";
  const pathLabel = path ?? "Not created yet";

  return (
    <div
      className={cn("flex w-full flex-col gap-0", SIDEBAR_HOVER_CARD_CONTAINER_PADDING_CLASS_NAME)}
    >
      <div className={SIDEBAR_HOVER_CARD_ROW_CLASS_NAME}>
        <WorktreeIcon className="size-3.5 shrink-0 text-muted-foreground/75" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={title}>
          {title}
        </span>
      </div>
      <dl className="flex flex-col gap-0">
        <div className={META_ROW_CLASS_NAME}>
          <dt className={META_LABEL_CLASS_NAME}>Branch</dt>
          <dd className={META_VALUE_CLASS_NAME} title={branchLabel}>
            {branchUrl && branch ? (
              <a
                href={branchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm font-medium text-foreground underline decoration-foreground/25 underline-offset-2 transition-colors hover:decoration-foreground/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
                aria-label={`Open ${branch} on GitHub`}
                onClick={(event) => onOpenBranch(event, branchUrl)}
              >
                <span className="truncate">{branch}</span>
                <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden />
              </a>
            ) : (
              branchLabel
            )}
          </dd>
        </div>
        <div className={META_ROW_CLASS_NAME}>
          <dt className={META_LABEL_CLASS_NAME}>Path</dt>
          <dd className={META_VALUE_CLASS_NAME} title={pathLabel}>
            {pathLabel}
          </dd>
        </div>
        <div className={META_ROW_CLASS_NAME}>
          <dt className={META_LABEL_CLASS_NAME}>From</dt>
          <dd className={META_VALUE_CLASS_NAME} title={source}>
            {source}
          </dd>
        </div>
        <div className={META_ROW_CLASS_NAME}>
          <dt className={META_LABEL_CLASS_NAME}>Status</dt>
          <dd className={cn(META_VALUE_CLASS_NAME, "capitalize")}>{status.replaceAll("-", " ")}</dd>
        </div>
      </dl>
      <div className={cn(SIDEBAR_HOVER_CARD_ROW_CLASS_NAME, "text-foreground/72")}>
        <MessageCircleIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
        <span className="min-w-0 truncate">
          {formatOpenConversationCount(openConversationCount)}
        </span>
      </div>
    </div>
  );
}

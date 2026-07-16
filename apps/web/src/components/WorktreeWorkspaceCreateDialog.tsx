import type {
  GitBranch,
  GitPullRequestListFilter,
  GitPullRequestListItem,
} from "@synara/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { readNativeApi } from "../nativeApi";
import { formatRelativeTime } from "../lib/relativeTime";
import { cn } from "../lib/utils";
import {
  CheckIcon,
  GitBranchIcon,
  GitMergedSimpleIcon,
  GitPullRequestIcon,
  SearchIcon,
} from "../lib/icons";
import { parsePullRequestReference } from "../pullRequestReference";
import { resolvePrStatePresentation } from "./Sidebar.logic";
import {
  branchNameFromWorkspaceTitle,
  dedupeWorkspaceBranches,
  filterWorkspaceBranches,
  filterWorkspacePullRequests,
  readableWorkspaceBranchName,
} from "./WorktreeWorkspaceCreateDialog.logic";
import { Button } from "./ui/button";
import { DisclosureRegion } from "./ui/DisclosureRegion";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";

export type WorkspaceCreateSource =
  | { kind: "new-branch"; branchName: string; targetRef: string }
  | { kind: "branch"; sourceRef: string; targetRef: string }
  | { kind: "pull-request"; reference: string };

interface WorktreeWorkspaceCreateDialogProps {
  open: boolean;
  projectName: string;
  projectCwd: string;
  defaultTargetRef: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { title: string; source: WorkspaceCreateSource }) => Promise<void>;
}

const SOURCE_OPTIONS = [
  { kind: "new-branch", label: "New branch" },
  { kind: "branch", label: "Existing branch" },
  { kind: "pull-request", label: "Pull request" },
] as const;

const PULL_REQUEST_FILTERS: ReadonlyArray<{
  value: GitPullRequestListFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "reviewing", label: "Reviewing" },
  { value: "authored", label: "Authored" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "merged", label: "Merged" },
];

function PullRequestAuthorAvatar({ login, url }: { login: string | null; url: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [url]);

  if (url && !imageFailed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-4 shrink-0 rounded-full bg-muted object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-medium uppercase text-muted-foreground"
    >
      {login?.slice(0, 1) || "?"}
    </span>
  );
}

function PullRequestStateIcon({ pullRequest }: { pullRequest: GitPullRequestListItem }) {
  const presentation = resolvePrStatePresentation(pullRequest);
  const Icon = presentation.iconKind === "merged-simple" ? GitMergedSimpleIcon : GitPullRequestIcon;
  return (
    <Icon
      className={cn("mt-0.5 size-4 shrink-0", presentation.colorClass)}
      aria-label={presentation.label}
    />
  );
}

function PullRequestRow({
  pullRequest,
  selected,
  onSelect,
}: {
  pullRequest: GitPullRequestListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1 rounded-md px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        selected
          ? "bg-[var(--color-background-elevated-secondary)] text-foreground"
          : "text-foreground hover:bg-[var(--color-background-elevated-secondary)]/65",
      )}
      onClick={onSelect}
    >
      <span className="row-span-2">
        <PullRequestStateIcon pullRequest={pullRequest} />
      </span>
      <span className="min-w-0 truncate text-xs font-medium leading-4">{pullRequest.title}</span>
      <span className="shrink-0 tabular-nums text-[10px] leading-4 text-muted-foreground">
        {pullRequest.updatedAt ? formatRelativeTime(pullRequest.updatedAt) : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <PullRequestAuthorAvatar
          login={pullRequest.authorLogin}
          url={pullRequest.authorAvatarUrl}
        />
        <span className="min-w-0 truncate">
          {pullRequest.authorLogin ?? "Unknown author"}
          <span aria-hidden> · </span>
          {pullRequest.headBranch}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums text-[10px]">
        {pullRequest.additions !== null ? (
          <span className="text-[var(--color-decoration-added)]">
            +{pullRequest.additions.toLocaleString()}
          </span>
        ) : null}
        {pullRequest.deletions !== null ? (
          <span className="text-[var(--color-decoration-deleted)]">
            −{pullRequest.deletions.toLocaleString()}
          </span>
        ) : null}
        {selected ? <CheckIcon className="size-3 text-foreground" aria-hidden /> : null}
      </span>
    </button>
  );
}

export function WorktreeWorkspaceCreateDialog({
  open,
  projectName,
  projectCwd,
  defaultTargetRef,
  onOpenChange,
  onCreate,
}: WorktreeWorkspaceCreateDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const branchSearchRef = useRef<HTMLInputElement>(null);
  const pullRequestSearchRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("New workspace");
  const [branchName, setBranchName] = useState(branchNameFromWorkspaceTitle("New workspace"));
  const [branchNameTouched, setBranchNameTouched] = useState(false);
  const [sourceKind, setSourceKind] = useState<WorkspaceCreateSource["kind"]>("new-branch");
  const [targetRef, setTargetRef] = useState(defaultTargetRef ?? "HEAD");
  const [repositoryTargetRef, setRepositoryTargetRef] = useState(defaultTargetRef ?? "HEAD");
  const [branchQuery, setBranchQuery] = useState("");
  const [pullRequestQuery, setPullRequestQuery] = useState("");
  const [pullRequestFilter, setPullRequestFilter] = useState<GitPullRequestListFilter>("all");
  const [pullRequestReference, setPullRequestReference] = useState("");
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [pullRequests, setPullRequests] = useState<GitPullRequestListItem[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingPullRequests, setIsLoadingPullRequests] = useState(false);
  const [branchListError, setBranchListError] = useState<string | null>(null);
  const [pullRequestListError, setPullRequestListError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("New workspace");
    setBranchName(branchNameFromWorkspaceTitle("New workspace"));
    setBranchNameTouched(false);
    setSourceKind("new-branch");
    setTargetRef(defaultTargetRef ?? "HEAD");
    setRepositoryTargetRef(defaultTargetRef ?? "HEAD");
    setBranchQuery("");
    setPullRequestQuery("");
    setPullRequestFilter("all");
    setPullRequestReference("");
    setPullRequests([]);
    setBranchListError(null);
    setPullRequestListError(null);
    setError(null);
    setIsCreating(false);
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
    const api = readNativeApi();
    if (!api) return () => window.cancelAnimationFrame(frame);
    setIsLoadingBranches(true);
    void api.git
      .listBranches({ cwd: projectCwd })
      .then((result) => {
        if (cancelled) return;
        setBranches([...result.branches]);
        const preferred =
          result.branches.find((branch) => !branch.isRemote && branch.isDefault)?.name ??
          result.branches.find((branch) => !branch.isRemote && branch.current)?.name;
        setTargetRef(defaultTargetRef ?? preferred ?? "HEAD");
        setRepositoryTargetRef(defaultTargetRef ?? preferred ?? "HEAD");
      })
      .catch((cause) => {
        if (cancelled) return;
        setBranchListError(
          cause instanceof Error ? cause.message : "Branches could not be loaded. Try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [defaultTargetRef, open, projectCwd]);

  useEffect(() => {
    if (!open || sourceKind !== "pull-request") return;
    const api = readNativeApi();
    if (!api) return;
    let cancelled = false;
    setPullRequests([]);
    setPullRequestListError(null);
    setIsLoadingPullRequests(true);
    void api.git
      .listPullRequests({ cwd: projectCwd, filter: pullRequestFilter })
      .then((result) => {
        if (!cancelled) setPullRequests([...result.pullRequests]);
      })
      .catch((cause) => {
        if (cancelled) return;
        setPullRequestListError(
          cause instanceof Error
            ? cause.message
            : "Pull requests could not be loaded. Check GitHub CLI and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPullRequests(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectCwd, pullRequestFilter, sourceKind]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (sourceKind === "pull-request") pullRequestSearchRef.current?.focus();
      if (sourceKind === "branch") branchSearchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, sourceKind]);

  const branchOptions = useMemo(() => dedupeWorkspaceBranches(branches), [branches]);
  const selectedBranch = branchOptions.find((branch) => branch.name === targetRef) ?? null;
  const filteredBranchOptions = useMemo(
    () => filterWorkspaceBranches(branchOptions, branchQuery),
    [branchOptions, branchQuery],
  );
  const filteredPullRequests = useMemo(
    () => filterWorkspacePullRequests(pullRequests, pullRequestQuery),
    [pullRequestQuery, pullRequests],
  );
  const directPullRequestReference = parsePullRequestReference(pullRequestQuery);
  const visibleDirectPullRequestReference =
    directPullRequestReference &&
    !filteredPullRequests.some(
      (pullRequest) =>
        pullRequest.url === directPullRequestReference ||
        `#${pullRequest.number}` === directPullRequestReference ||
        String(pullRequest.number) === directPullRequestReference,
    )
      ? directPullRequestReference
      : null;
  const selectedPullRequest =
    pullRequests.find((pullRequest) => pullRequest.url === pullRequestReference) ?? null;
  const canCreate =
    title.trim().length > 0 &&
    (sourceKind === "pull-request"
      ? pullRequestReference.trim().length > 0
      : sourceKind === "new-branch"
        ? branchName.trim().length > 0 && repositoryTargetRef.trim().length > 0
        : targetRef.trim().length > 0 &&
          selectedBranch !== null &&
          selectedBranch.worktreePath == null) &&
    !isCreating;

  const createWorkspace = async () => {
    if (!canCreate) return;
    setIsCreating(true);
    setError(null);
    try {
      const source: WorkspaceCreateSource =
        sourceKind === "pull-request"
          ? { kind: sourceKind, reference: pullRequestReference.trim() }
          : sourceKind === "branch"
            ? {
                kind: sourceKind,
                sourceRef: targetRef.trim(),
                targetRef: repositoryTargetRef.trim(),
              }
            : {
                kind: sourceKind,
                branchName: branchName.trim(),
                targetRef: repositoryTargetRef.trim(),
              };
      await onCreate({ title: title.trim(), source });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workspace could not be created.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isCreating) onOpenChange(nextOpen);
      }}
    >
      <DialogPopup surface="solid" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Start a focused worktree in {projectName} from a new branch, an existing branch, or a
            GitHub pull request.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">Workspace name</span>
            <Input
              ref={titleRef}
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!branchNameTouched) setBranchName(branchNameFromWorkspaceTitle(nextTitle));
              }}
            />
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-xs font-medium text-foreground">Create from</legend>
            <div className="grid grid-cols-3 rounded-lg bg-muted/45 p-0.5">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  aria-pressed={sourceKind === option.kind}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs outline-none transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    sourceKind === option.kind
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setSourceKind(option.kind);
                    setError(null);
                    if (option.kind !== "pull-request") {
                      setPullRequestReference("");
                    }
                    if (option.kind === "new-branch") {
                      setTargetRef(repositoryTargetRef);
                      setBranchQuery("");
                    }
                    if (option.kind === "branch" && selectedBranch?.worktreePath) {
                      const availableBranch = branchOptions.find(
                        (branch) => branch.worktreePath == null,
                      );
                      setTargetRef(availableBranch?.name ?? "");
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <DisclosureRegion open={sourceKind === "new-branch"}>
            <div className="grid gap-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Branch name</span>
                <Input
                  value={branchName}
                  placeholder="synara/feature-name"
                  spellCheck={false}
                  onChange={(event) => {
                    setBranchName(event.target.value);
                    setBranchNameTouched(true);
                    setError(null);
                  }}
                />
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Creates this branch from {repositoryTargetRef}.
              </p>
            </div>
          </DisclosureRegion>

          {sourceKind === "pull-request" ? (
            <div className="grid gap-2.5">
              <div className="flex gap-1 overflow-x-auto pb-0.5" aria-label="Pull request filters">
                {PULL_REQUEST_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={pullRequestFilter === filter.value}
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-1 text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      pullRequestFilter === filter.value
                        ? "border-foreground/15 bg-foreground/8 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                    onClick={() => {
                      setPullRequestFilter(filter.value);
                      setPullRequestReference("");
                      setError(null);
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Pull requests</span>
                <span className="relative block">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={pullRequestSearchRef}
                    type="search"
                    value={pullRequestQuery}
                    placeholder="Search title, author, branch, or number"
                    className="[&_input]:pl-8"
                    onChange={(event) => {
                      setPullRequestQuery(event.target.value);
                      setPullRequestReference("");
                      setError(null);
                    }}
                  />
                </span>
              </label>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background/35 p-1">
                {isLoadingPullRequests ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Loading pull requests…
                  </div>
                ) : pullRequestListError ? (
                  <div className="grid gap-1 px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                    <p>Pull requests could not be loaded.</p>
                    <p className="text-[11px]">{pullRequestListError}</p>
                  </div>
                ) : filteredPullRequests.length === 0 && !visibleDirectPullRequestReference ? (
                  <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                    {pullRequests.length === 0
                      ? `No ${pullRequestFilter === "all" ? "" : `${pullRequestFilter} `}pull requests found.`
                      : "No pull requests match your search."}
                  </div>
                ) : (
                  <div className="grid gap-0.5">
                    {visibleDirectPullRequestReference ? (
                      <button
                        type="button"
                        aria-pressed={pullRequestReference === visibleDirectPullRequestReference}
                        className={cn(
                          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          pullRequestReference === visibleDirectPullRequestReference
                            ? "bg-[var(--color-background-elevated-secondary)]"
                            : "hover:bg-[var(--color-background-elevated-secondary)]/65",
                        )}
                        onClick={() => {
                          setPullRequestReference(visibleDirectPullRequestReference);
                          setError(null);
                        }}
                      >
                        <GitPullRequestIcon className="size-4 text-muted-foreground" />
                        <span className="min-w-0 truncate text-xs font-medium">
                          Use {visibleDirectPullRequestReference}
                        </span>
                        {pullRequestReference === visibleDirectPullRequestReference ? (
                          <CheckIcon className="size-3" />
                        ) : null}
                      </button>
                    ) : null}
                    {filteredPullRequests.map((pullRequest) => (
                      <PullRequestRow
                        key={pullRequest.url}
                        pullRequest={pullRequest}
                        selected={pullRequestReference === pullRequest.url}
                        onSelect={() => {
                          setPullRequestReference(pullRequest.url);
                          setError(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {selectedPullRequest ? (
                <p className="text-[11px] text-muted-foreground">
                  The workspace will track <strong>{selectedPullRequest.headBranch}</strong> and
                  target <strong>{selectedPullRequest.baseBranch}</strong>.
                </p>
              ) : null}
            </div>
          ) : null}

          <DisclosureRegion open={sourceKind === "branch"}>
            <div className="grid gap-2">
              <label className="grid gap-1.5" htmlFor="workspace-branch-search">
                <span className="text-xs font-medium text-foreground">Starting branch</span>
                <span className="relative block">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="workspace-branch-search"
                    ref={branchSearchRef}
                    type="search"
                    value={branchQuery}
                    placeholder="Search branches"
                    className="[&_input]:pl-8"
                    disabled={isLoadingBranches}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      setBranchQuery(nextQuery);
                      if (
                        selectedBranch &&
                        filterWorkspaceBranches([selectedBranch], nextQuery).length === 0
                      ) {
                        setTargetRef("");
                      }
                      setError(null);
                    }}
                  />
                </span>
              </label>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background/35 p-1">
                {isLoadingBranches ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Loading branches…
                  </div>
                ) : branchListError ? (
                  <div className="grid gap-1 px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                    <p>Branches could not be loaded.</p>
                    <p className="text-[11px]">{branchListError}</p>
                  </div>
                ) : filteredBranchOptions.length === 0 ? (
                  <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                    No branches match your search.
                  </div>
                ) : (
                  <div className="grid gap-0.5">
                    {filteredBranchOptions.map((branch) => {
                      const selected = branch.name === targetRef;
                      const unavailable = branch.worktreePath != null;
                      return (
                        <button
                          key={`${branch.isRemote ? "remote" : "local"}:${branch.name}`}
                          type="button"
                          disabled={unavailable}
                          aria-pressed={selected}
                          className={cn(
                            "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                            selected
                              ? "bg-[var(--color-background-elevated-secondary)] text-foreground"
                              : "text-foreground hover:bg-[var(--color-background-elevated-secondary)]/65",
                            unavailable && "cursor-not-allowed opacity-45",
                          )}
                          onClick={() => {
                            setTargetRef(branch.name);
                            setError(null);
                          }}
                        >
                          <GitBranchIcon className="size-3.5 text-muted-foreground" />
                          <span className="min-w-0 truncate text-xs font-medium">
                            {readableWorkspaceBranchName(branch)}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                            {branch.isDefault ? <span>Default</span> : null}
                            {branch.isRemote ? <span>Remote</span> : null}
                            {unavailable ? <span>In another worktree</span> : null}
                            {selected ? <CheckIcon className="size-3 text-foreground" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </DisclosureRegion>

          {sourceKind === "branch" ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Synara checks out this branch and targets {repositoryTargetRef}. Branches already used
              by another worktree stay unavailable to prevent Git conflicts.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs leading-relaxed text-red-400">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button disabled={!canCreate} onClick={() => void createWorkspace()}>
            {isCreating ? <Spinner className="size-3.5" /> : null}
            {isCreating ? "Creating workspace…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

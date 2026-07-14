import type { GitBranch } from "@synara/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { readNativeApi } from "../nativeApi";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
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
  | { kind: "new-branch"; targetRef: string }
  | { kind: "branch"; targetRef: string }
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
  { kind: "branch", label: "Branch" },
  { kind: "pull-request", label: "Pull request" },
] as const;

function readableBranchName(branch: GitBranch): string {
  if (!branch.isRemote || !branch.remoteName) return branch.name;
  return branch.name.replace(new RegExp(`^${branch.remoteName}/`), "");
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
  const [title, setTitle] = useState("New workspace");
  const [sourceKind, setSourceKind] = useState<WorkspaceCreateSource["kind"]>("new-branch");
  const [targetRef, setTargetRef] = useState(defaultTargetRef ?? "HEAD");
  const [pullRequestReference, setPullRequestReference] = useState("");
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("New workspace");
    setSourceKind("new-branch");
    setTargetRef(defaultTargetRef ?? "HEAD");
    setPullRequestReference("");
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
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Branches could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [defaultTargetRef, open, projectCwd]);

  const branchOptions = useMemo(
    () =>
      branches.filter(
        (branch, index, allBranches) =>
          allBranches.findIndex(
            (candidate) => readableBranchName(candidate) === readableBranchName(branch),
          ) === index,
      ),
    [branches],
  );
  const selectedBranch = branchOptions.find((branch) => branch.name === targetRef) ?? null;
  const canCreate =
    title.trim().length > 0 &&
    (sourceKind === "pull-request"
      ? pullRequestReference.trim().length > 0
      : targetRef.trim().length > 0 &&
        (sourceKind !== "branch" || selectedBranch?.worktreePath == null)) &&
    !isCreating;

  const createWorkspace = async () => {
    if (!canCreate) return;
    setIsCreating(true);
    setError(null);
    try {
      const source: WorkspaceCreateSource =
        sourceKind === "pull-request"
          ? { kind: sourceKind, reference: pullRequestReference.trim() }
          : { kind: sourceKind, targetRef: targetRef.trim() };
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
      <DialogPopup surface="solid" className="max-w-xl">
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
              onChange={(event) => setTitle(event.target.value)}
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
                    "rounded-md px-2 py-1.5 text-xs transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                    sourceKind === option.kind
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setSourceKind(option.kind);
                    if (option.kind === "branch" && selectedBranch?.worktreePath) {
                      const availableBranch = branchOptions.find(
                        (branch) => branch.worktreePath == null,
                      );
                      if (availableBranch) setTargetRef(availableBranch.name);
                    }
                    setError(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {sourceKind === "pull-request" ? (
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Pull request</span>
              <Input
                value={pullRequestReference}
                placeholder="https://github.com/owner/repo/pull/42 or #42"
                onChange={(event) => setPullRequestReference(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createWorkspace();
                  }
                }}
              />
            </label>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">
                {sourceKind === "new-branch" ? "Target branch" : "Starting branch"}
              </span>
              <select
                value={targetRef}
                disabled={isLoadingBranches}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setTargetRef(event.target.value)}
              >
                {branchOptions.length === 0 ? <option value={targetRef}>{targetRef}</option> : null}
                {branchOptions.map((branch) => (
                  <option
                    key={`${branch.isRemote ? "remote" : "local"}:${branch.name}`}
                    value={branch.name}
                    disabled={sourceKind === "branch" && branch.worktreePath != null}
                  >
                    {readableBranchName(branch)}
                    {branch.isRemote ? " · remote" : ""}
                    {sourceKind === "branch" && branch.worktreePath ? " · already checked out" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {sourceKind === "branch" ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Synara checks out this branch in the new workspace. Branches already used by another
              worktree stay unavailable to prevent Git conflicts.
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

import type { OrchestrationWorktreeWorkspace } from "@synara/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiGitBranch } from "react-icons/fi";

import { readNativeApi } from "../nativeApi";
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

interface WorktreeWorkspaceRenameDialogProps {
  open: boolean;
  workspace: OrchestrationWorktreeWorkspace | null;
  onOpenChange: (open: boolean) => void;
  onRename: (input: { title: string; renameBranch: boolean }) => Promise<void>;
}

export function branchNameFromWorkspaceTitle(title: string, currentBranch: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const separatorIndex = currentBranch.lastIndexOf("/");
  const prefix = separatorIndex > 0 ? currentBranch.slice(0, separatorIndex) : null;
  return prefix ? `${prefix}/${slug || "workspace"}` : slug || "workspace";
}

export function WorktreeWorkspaceRenameDialog({
  open,
  workspace,
  onOpenChange,
  onRename,
}: WorktreeWorkspaceRenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [renameBranch, setRenameBranch] = useState(false);
  const [canRenameBranch, setCanRenameBranch] = useState(false);
  const [branchReason, setBranchReason] = useState<string | null>(null);
  const [isCheckingBranch, setIsCheckingBranch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workspace) return;
    setTitle(workspace.title);
    setRenameBranch(false);
    setError(null);
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    if (workspace.state !== "ready" || !workspace.path || !workspace.branch) {
      setCanRenameBranch(false);
      setBranchReason("The branch can be renamed after this workspace is ready.");
      return () => window.cancelAnimationFrame(frame);
    }
    const api = readNativeApi();
    if (!api) return () => window.cancelAnimationFrame(frame);
    setIsCheckingBranch(true);
    void api.git
      .status({ cwd: workspace.path })
      .then((status) => {
        if (cancelled) return;
        const published = status.hasUpstream || status.pr !== null;
        setCanRenameBranch(!published);
        setBranchReason(
          published
            ? "This branch is published or has a pull request. Rename it on GitHub first."
            : null,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCanRenameBranch(false);
        setBranchReason("Synara could not verify whether this branch is published.");
      })
      .finally(() => {
        if (!cancelled) setIsCheckingBranch(false);
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [open, workspace]);

  const nextBranch = useMemo(
    () => (workspace?.branch ? branchNameFromWorkspaceTitle(title, workspace.branch) : null),
    [title, workspace?.branch],
  );
  const canSave = title.trim().length > 0 && !isSaving;

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await onRename({ title: title.trim(), renameBranch });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workspace could not be renamed.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen);
      }}
    >
      <DialogPopup surface="solid" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>
            Change the workspace label without moving its files or interrupting active terminals.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">Workspace name</span>
            <Input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void save();
                }
              }}
            />
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border/65 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-foreground"
              checked={renameBranch}
              disabled={!canRenameBranch || isCheckingBranch}
              onChange={(event) => setRenameBranch(event.target.checked)}
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <FiGitBranch className="size-3.5 text-muted-foreground" />
                Also rename branch
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {isCheckingBranch
                  ? "Checking branch status…"
                  : (branchReason ??
                    (nextBranch ? `The local branch will become ${nextBranch}.` : ""))}
              </span>
            </span>
          </label>
          {error ? (
            <p role="alert" className="text-xs leading-relaxed text-red-400">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {isSaving ? <Spinner className="size-3.5" /> : null}
            {isSaving ? "Renaming workspace…" : "Rename workspace"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

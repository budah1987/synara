import type { GitHubRepositorySummary } from "@synara/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiGithub } from "react-icons/fi";
import { ArchiveIcon, CheckIcon, LockIcon, SearchIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

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

interface GitHubProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (repository: string) => Promise<void>;
  onListRepositories: () => Promise<readonly GitHubRepositorySummary[]>;
}

type RepositoryEntryMode = "search" | "paste";

export function filterGitHubRepositories(
  repositories: readonly GitHubRepositorySummary[],
  query: string,
): readonly GitHubRepositorySummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return repositories;
  return repositories.filter((repository) =>
    [repository.nameWithOwner, repository.description, repository.defaultBranch]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function GitHubProjectDialog({
  open,
  onOpenChange,
  onClone,
  onListRepositories,
}: GitHubProjectDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entryMode, setEntryMode] = useState<RepositoryEntryMode>("search");
  const [repository, setRepository] = useState("");
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositories, setRepositories] = useState<readonly GitHubRepositorySummary[]>([]);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [repositoryListError, setRepositoryListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntryMode("search");
    setRepository("");
    setRepositoryQuery("");
    setRepositories([]);
    setRepositoryListError(null);
    setError(null);
    setIsCloning(false);
    setIsLoadingRepositories(true);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    void onListRepositories()
      .then((nextRepositories) => {
        if (!cancelled) setRepositories(nextRepositories);
      })
      .catch((cause) => {
        if (cancelled) return;
        setRepositoryListError(
          cause instanceof Error ? cause.message : "GitHub repositories could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRepositories(false);
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [onListRepositories, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [entryMode, open]);

  const filteredRepositories = useMemo(
    () => filterGitHubRepositories(repositories, repositoryQuery),
    [repositories, repositoryQuery],
  );

  const cloneRepository = async (candidate = repository) => {
    const trimmedRepository = candidate.trim();
    if (!trimmedRepository || isCloning) return;
    setIsCloning(true);
    setError(null);
    try {
      await onClone(trimmedRepository);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The repository could not be cloned.");
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isCloning) onOpenChange(nextOpen);
      }}
    >
      <DialogPopup surface="solid" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FiGithub className="size-4" />
            Add GitHub project
          </DialogTitle>
          <DialogDescription>
            Search repositories available to your GitHub account, or paste a repository URL. Synara
            keeps the managed checkout out of your way.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3.5">
          <div
            className="grid grid-cols-2 rounded-lg bg-muted/45 p-0.5"
            aria-label="Repository input"
          >
            {(
              [
                ["search", "Search GitHub"],
                ["paste", "Paste URL"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={entryMode === mode}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                  entryMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setEntryMode(mode);
                  setRepository("");
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {entryMode === "search" ? (
            <div className="grid gap-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Repository</span>
                <span className="relative block">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    type="search"
                    value={repositoryQuery}
                    placeholder="Search repositories and owners"
                    className="[&_input]:pl-8"
                    onChange={(event) => {
                      setRepositoryQuery(event.target.value);
                      setError(null);
                    }}
                  />
                </span>
              </label>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background/35 p-1">
                {isLoadingRepositories ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Loading your repositories…
                  </div>
                ) : repositoryListError ? (
                  <div className="grid justify-items-start gap-2 px-3 py-5 text-xs leading-relaxed text-muted-foreground">
                    <p>{repositoryListError}</p>
                    <button
                      type="button"
                      className="font-medium text-foreground hover:underline"
                      onClick={() => setEntryMode("paste")}
                    >
                      Paste a repository instead
                    </button>
                  </div>
                ) : filteredRepositories.length === 0 ? (
                  <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                    {repositories.length === 0
                      ? "No repositories are available to this GitHub account."
                      : "No repositories match your search."}
                  </div>
                ) : (
                  <div className="grid gap-0.5">
                    {filteredRepositories.map((item) => {
                      const selected = repository === item.nameWithOwner;
                      return (
                        <button
                          key={item.nameWithOwner}
                          type="button"
                          aria-pressed={selected}
                          className={cn(
                            "grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                            selected
                              ? "bg-[var(--color-background-elevated-secondary)] text-foreground"
                              : "text-foreground hover:bg-[var(--color-background-elevated-secondary)]/65",
                          )}
                          onClick={() => {
                            setRepository(item.nameWithOwner);
                            setError(null);
                          }}
                        >
                          <span className="min-w-0 truncate text-xs font-medium">
                            {item.nameWithOwner}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                            {item.isPrivate ? (
                              <LockIcon className="size-3" aria-label="Private" />
                            ) : null}
                            {item.isArchived ? (
                              <ArchiveIcon className="size-3" aria-label="Archived" />
                            ) : null}
                            {selected ? <CheckIcon className="size-3 text-foreground" /> : null}
                          </span>
                          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                            {item.description || item.defaultBranch || "GitHub repository"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">
                Repository URL or owner/name
              </span>
              <Input
                ref={inputRef}
                value={repository}
                placeholder="github.com/owner/repository"
                aria-describedby={error ? "github-project-error" : "github-project-location"}
                onChange={(event) => {
                  setRepository(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void cloneRepository();
                  }
                }}
              />
            </label>
          )}
          <p id="github-project-location" className="text-xs leading-relaxed text-muted-foreground">
            Synara reuses managed checkouts from <code>~/.synara/repositories</code>. You can choose
            a branch when creating the first workspace.
          </p>
          {error ? (
            <p
              id="github-project-error"
              role="alert"
              className="text-xs leading-relaxed text-red-400"
            >
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCloning}>
            Cancel
          </Button>
          <Button onClick={() => void cloneRepository()} disabled={!repository.trim() || isCloning}>
            {isCloning ? <Spinner className="size-3.5" /> : null}
            {isCloning ? "Cloning repository…" : "Clone repository"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

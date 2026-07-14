import { useEffect, useRef, useState } from "react";
import { FiGithub } from "react-icons/fi";

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
}

export function GitHubProjectDialog({ open, onOpenChange, onClone }: GitHubProjectDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [repository, setRepository] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRepository("");
    setError(null);
    setIsCloning(false);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const cloneRepository = async () => {
    const trimmedRepository = repository.trim();
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
            Open GitHub project
          </DialogTitle>
          <DialogDescription>
            Paste a repository URL or owner/name. Synara will clone it into its managed projects
            folder and keep the local checkout out of your way.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">Repository</span>
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
          <p id="github-project-location" className="text-xs leading-relaxed text-muted-foreground">
            Managed checkouts are stored under <code>~/.synara/repositories</code> and reused when
            you open the same repository again.
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

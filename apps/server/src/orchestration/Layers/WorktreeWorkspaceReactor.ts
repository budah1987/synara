import { exec } from "node:child_process";
import { createHash } from "node:crypto";

import {
  CommandId,
  type ProjectId,
  type OrchestrationWorktreeWorkspace,
  WorktreeWorkspaceId,
} from "@synara/contracts";
import { makeDrainableWorker } from "@synara/shared/DrainableWorker";
import { Cause, Effect, FileSystem, Layer, Path, Stream } from "effect";

import { ServerConfig } from "../../config";
import { GitCore } from "../../git/Services/GitCore";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine";
import {
  WorktreeWorkspaceReactor,
  type WorktreeWorkspaceReactorShape,
} from "../Services/WorktreeWorkspaceReactor";

interface ProvisionRequest {
  readonly workspaceId: WorktreeWorkspaceId;
  readonly projectId: ProjectId;
}

const commandId = (tag: string, workspaceId: string) =>
  CommandId.makeUnsafe(`server:workspace:${tag}:${workspaceId}:${crypto.randomUUID()}`);

function workspaceBranchName(workspace: OrchestrationWorktreeWorkspace): string {
  const slug = workspace.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `synara/${slug || "workspace"}-${String(workspace.id).slice(0, 8)}`;
}

export function resolveWorkspaceBranchProvisioning(input: {
  sourceKind: OrchestrationWorktreeWorkspace["sourceKind"];
  targetRef: string;
  resolvedCommit: string;
  generatedBranch: string;
  localBranchExists: boolean;
  remotes: readonly string[];
}): { branch: string; newBranch: string | undefined } {
  if (input.sourceKind !== "branch") {
    return { branch: input.resolvedCommit, newBranch: input.generatedBranch };
  }
  if (input.localBranchExists) {
    return { branch: input.targetRef, newBranch: undefined };
  }
  const remote = input.remotes.find((candidate) => input.targetRef.startsWith(`${candidate}/`));
  return {
    branch: input.targetRef,
    newBranch: remote ? input.targetRef.slice(remote.length + 1) : input.targetRef,
  };
}

function errorSummary(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return (message.trim() || "Workspace provisioning failed").slice(0, 2_000);
}

function legacyWorkspaceId(projectId: ProjectId, canonicalPath: string): WorktreeWorkspaceId {
  const digest = createHash("sha256")
    .update(`${projectId}\0${canonicalPath}`)
    .digest("hex")
    .slice(0, 24);
  return WorktreeWorkspaceId.makeUnsafe(`legacy-${digest}`);
}

function runSetupCommand(command: string, cwd: string) {
  return Effect.callback<void, Error>((resume) => {
    const child = exec(
      command,
      {
        cwd,
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error) => resume(error ? Effect.fail(error) : Effect.void),
    );
    return Effect.sync(() => child.kill());
  });
}

export const makeWorktreeWorkspaceReactor = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const git = yield* GitCore;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const path = yield* Path.Path;
  const processing = new Set<string>();

  const canonicalPath = (value: string) =>
    fileSystem.realPath(value).pipe(Effect.catch(() => Effect.succeed(path.resolve(value))));

  const backfillLegacyWorkspaces = Effect.gen(function* () {
    const initial = yield* orchestrationEngine.getReadModel();
    for (const project of initial.projects) {
      if ((project.kind ?? "project") !== "project") continue;
      const projectPath = yield* canonicalPath(project.workspaceRoot);
      const candidates = initial.threads.filter(
        (thread) => thread.projectId === project.id && thread.workspaceId == null,
      );
      const groups = new Map<string, typeof candidates>();
      for (const thread of candidates) {
        const legacyPath =
          thread.worktreePath ?? thread.associatedWorktreePath ?? project.workspaceRoot;
        const resolvedPath = yield* canonicalPath(legacyPath);
        groups.set(resolvedPath, [...(groups.get(resolvedPath) ?? []), thread]);
      }

      for (const [resolvedPath, threads] of [...groups.entries()].toSorted(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const current = yield* orchestrationEngine.getReadModel();
        let workspace = (current.workspaces ?? []).find(
          (candidate) => candidate.projectId === project.id && candidate.path === resolvedPath,
        );
        if (!workspace) {
          const first = threads[0];
          if (!first) continue;
          const workspaceId = legacyWorkspaceId(project.id, resolvedPath);
          const branch = first.branch ?? first.associatedWorktreeBranch ?? null;
          const headRef = first.associatedWorktreeRef ?? null;
          const createdAt =
            threads.map((thread) => thread.createdAt).toSorted()[0] ?? new Date().toISOString();
          yield* orchestrationEngine.dispatch({
            type: "workspace.import-legacy",
            commandId: CommandId.makeUnsafe(`server:workspace:backfill:${workspaceId}`),
            workspaceId,
            projectId: project.id,
            repositoryIdentity: project.repositoryIdentity ?? project.workspaceRoot,
            kind: resolvedPath === projectPath ? "repository-root" : "external",
            state: "ready",
            title: branch ?? path.basename(resolvedPath),
            path: resolvedPath,
            branch,
            headRef,
            targetRef: project.defaultTargetRef ?? branch ?? "HEAD",
            targetResolvedCommit: headRef,
            createdFromCommit: headRef,
            setupStatus: "skipped",
            createdAt,
          });
          workspace = ((yield* orchestrationEngine.getReadModel()).workspaces ?? []).find(
            (candidate) => candidate.id === workspaceId,
          );
        }
        if (!workspace) continue;

        for (const thread of threads) {
          yield* orchestrationEngine.dispatch({
            type: "thread.workspace.assign",
            commandId: CommandId.makeUnsafe(
              `server:workspace:backfill-thread:${thread.id}:${workspace.id}`,
            ),
            threadId: thread.id,
            workspaceId: workspace.id,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("legacy worktree workspace backfill failed", {
        cause: Cause.pretty(cause),
      }),
    ),
  );

  const provision = Effect.fn(function* (request: ProvisionRequest) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const workspace = (readModel.workspaces ?? []).find(
      (candidate) => candidate.id === request.workspaceId,
    );
    const project = readModel.projects.find((candidate) => candidate.id === request.projectId);
    if (
      !workspace ||
      !project ||
      workspace.kind !== "managed" ||
      workspace.state !== "provisioning" ||
      workspace.activeOperation === null
    ) {
      return;
    }

    const operation = workspace.activeOperation;
    const worktreePath = path.join(config.worktreesDir, String(project.id), String(workspace.id));
    const generatedBranch = workspaceBranchName(workspace);
    let stage = "resolve-target";
    let createdPath: string | null = null;
    let createdBranch: string | null = null;
    let createdHead: string | null = null;
    let resolvedCommit: string | null = null;

    const fail = (cause: unknown) =>
      orchestrationEngine
        .dispatch({
          type: "workspace.operation.fail",
          commandId: commandId("provision-failed", String(workspace.id)),
          workspaceId: workspace.id,
          operationId: operation.id,
          generation: operation.generation,
          kind: stage === "setup" ? "setup" : "provision",
          stage,
          summary: errorSummary(cause),
          logId: null,
          path: createdPath,
          branch: createdBranch,
          headRef: createdHead,
          targetResolvedCommit: resolvedCommit,
          createdFromCommit: resolvedCommit,
          failedAt: new Date().toISOString(),
        })
        .pipe(
          Effect.asVoid,
          Effect.catchCause((dispatchCause) =>
            Effect.logWarning("failed to record workspace provisioning failure", {
              workspaceId: workspace.id,
              cause: Cause.pretty(dispatchCause),
            }),
          ),
        );

    yield* Effect.gen(function* () {
      const existingPath = yield* fileSystem.exists(worktreePath);
      if (existingPath) {
        stage = "reconcile-worktree";
        createdHead = (yield* git.execute({
          operation: "WorktreeWorkspaceReactor.reconcileHead",
          cwd: worktreePath,
          args: ["rev-parse", "HEAD"],
        })).stdout.trim();
        createdBranch = (yield* git.execute({
          operation: "WorktreeWorkspaceReactor.reconcileBranch",
          cwd: worktreePath,
          args: ["branch", "--show-current"],
        })).stdout.trim();
        if (!createdHead || !createdBranch) {
          return yield* Effect.fail(new Error("Existing worktree has no branch or HEAD commit"));
        }
        createdPath = worktreePath;
        resolvedCommit = createdHead;
      } else {
        stage = "resolve-target";
        resolvedCommit = (yield* git.execute({
          operation: "WorktreeWorkspaceReactor.resolveTarget",
          cwd: project.workspaceRoot,
          args: ["rev-parse", "--verify", `${workspace.targetRef}^{commit}`],
        })).stdout.trim();
        if (!resolvedCommit) {
          return yield* Effect.fail(new Error(`Target '${workspace.targetRef}' has no commit`));
        }

        stage = "create-worktree";
        yield* fileSystem.makeDirectory(path.dirname(worktreePath), { recursive: true });
        let localBranchExists = false;
        let remotes: readonly string[] = [];
        if (workspace.sourceKind === "branch") {
          const localBranch = yield* git.execute({
            operation: "WorktreeWorkspaceReactor.resolveLocalBranch",
            cwd: project.workspaceRoot,
            args: ["show-ref", "--verify", "--quiet", `refs/heads/${workspace.targetRef}`],
            allowNonZeroExit: true,
          });
          localBranchExists = localBranch.code === 0;
          if (!localBranchExists) {
            remotes = (yield* git.execute({
              operation: "WorktreeWorkspaceReactor.listRemotes",
              cwd: project.workspaceRoot,
              args: ["remote"],
            })).stdout
              .split("\n")
              .map((remote) => remote.trim())
              .filter(Boolean);
          }
        }
        const { branch, newBranch } = resolveWorkspaceBranchProvisioning({
          sourceKind: workspace.sourceKind,
          targetRef: workspace.targetRef,
          resolvedCommit,
          generatedBranch,
          localBranchExists,
          remotes,
        });
        const result = yield* git.createWorktree({
          cwd: project.workspaceRoot,
          branch,
          newBranch,
          path: worktreePath,
        });
        createdPath = result.worktree.path;
        createdBranch = result.worktree.branch;
        createdHead = (yield* git.execute({
          operation: "WorktreeWorkspaceReactor.readHead",
          cwd: createdPath,
          args: ["rev-parse", "HEAD"],
        })).stdout.trim();
      }

      if (!createdPath || !createdBranch || !createdHead || !resolvedCommit) {
        return yield* Effect.fail(new Error("Worktree provisioning returned incomplete metadata"));
      }

      stage = "setup";
      const setupScripts = project.scripts.filter((script) => script.runOnWorktreeCreate);
      for (const script of setupScripts) {
        yield* runSetupCommand(script.command, createdPath);
      }

      stage = "commit-completion";
      yield* orchestrationEngine.dispatch({
        type: "workspace.provision.complete",
        commandId: commandId("provision-complete", String(workspace.id)),
        workspaceId: workspace.id,
        operationId: operation.id,
        generation: operation.generation,
        path: createdPath,
        branch: createdBranch,
        headRef: createdHead,
        targetResolvedCommit: resolvedCommit,
        createdFromCommit: resolvedCommit,
        setupStatus: setupScripts.length > 0 ? "succeeded" : "skipped",
        completedAt: new Date().toISOString(),
      });
    }).pipe(Effect.catch(fail));
  });

  const processRequest = (request: ProvisionRequest) =>
    provision(request).pipe(
      Effect.ensuring(Effect.sync(() => processing.delete(String(request.workspaceId)))),
    );
  const worker = yield* makeDrainableWorker(processRequest);

  const enqueue = (request: ProvisionRequest) => {
    const id = String(request.workspaceId);
    if (processing.has(id)) return Effect.void;
    processing.add(id);
    return worker.enqueue(request);
  };

  const start: WorktreeWorkspaceReactorShape["start"] = Effect.gen(function* () {
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) =>
        event.type === "workspace.created" && event.payload.kind === "managed"
          ? enqueue({
              workspaceId: event.payload.workspaceId,
              projectId: event.payload.projectId,
            })
          : Effect.void,
      ),
    );

    yield* backfillLegacyWorkspaces;

    const snapshot = yield* orchestrationEngine.getReadModel();
    for (const workspace of snapshot.workspaces ?? []) {
      if (
        workspace.kind === "managed" &&
        workspace.state === "provisioning" &&
        workspace.activeOperation !== null
      ) {
        yield* enqueue({
          workspaceId: workspace.id,
          projectId: workspace.projectId,
        });
      }
    }
  });

  return { start } satisfies WorktreeWorkspaceReactorShape;
});

export const WorktreeWorkspaceReactorLive = Layer.effect(
  WorktreeWorkspaceReactor,
  makeWorktreeWorkspaceReactor,
);

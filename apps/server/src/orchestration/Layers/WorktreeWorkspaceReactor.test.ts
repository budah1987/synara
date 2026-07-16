import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
  WorktreeWorkspaceId,
  WorkspaceOperationId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@synara/contracts";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { ServerConfig } from "../../config";
import { DevServerManager, type DevServerManagerShape } from "../../devServerManager";
import { GitCoreLive } from "../../git/Layers/GitCore";
import { TerminalManager, type TerminalManagerShape } from "../../terminal/Services/Manager";
import { decideOrchestrationCommand } from "../decider";
import { projectEvent } from "../projector";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine";
import { WorktreeWorkspaceReactor } from "../Services/WorktreeWorkspaceReactor";
import {
  resolveWorkspaceBranchProvisioning,
  WorktreeWorkspaceReactorLive,
} from "./WorktreeWorkspaceReactor";

const runtimeSafetyLayer = Layer.merge(
  Layer.succeed(DevServerManager, {
    list: Effect.succeed({ servers: [] }),
    stream: Stream.empty,
    run: () => Effect.die("unused dev-server run"),
    stop: () => Effect.succeed({ stopped: false }),
  } satisfies DevServerManagerShape),
  Layer.succeed(TerminalManager, {
    hasRunningSessionForThreadIds: () => Effect.succeed(false),
    open: () => Effect.die("unused terminal open"),
    write: () => Effect.die("unused terminal write"),
    ackOutput: () => Effect.die("unused terminal ack"),
    resize: () => Effect.die("unused terminal resize"),
    clear: () => Effect.die("unused terminal clear"),
    restart: () => Effect.die("unused terminal restart"),
    close: () => Effect.die("unused terminal close"),
    subscribe: () => Effect.succeed(() => undefined),
    dispose: Effect.void,
  } satisfies TerminalManagerShape),
);

describe("resolveWorkspaceBranchProvisioning", () => {
  it("checks out a free local branch without changing its identity", () => {
    expect(
      resolveWorkspaceBranchProvisioning({
        sourceKind: "branch",
        sourceRef: "feature/existing",
        sourceCommit: "abc123",
        generatedBranch: "synara/generated",
        localBranchExists: true,
        remotes: ["origin"],
      }),
    ).toEqual({ branch: "feature/existing", newBranch: undefined });
  });

  it("creates the matching local branch name for a remote branch", () => {
    expect(
      resolveWorkspaceBranchProvisioning({
        sourceKind: "branch",
        sourceRef: "origin/feature/existing",
        sourceCommit: "abc123",
        generatedBranch: "synara/generated",
        localBranchExists: false,
        remotes: ["origin"],
      }),
    ).toEqual({ branch: "origin/feature/existing", newBranch: "feature/existing" });
  });
});

describe("WorktreeWorkspaceReactor", () => {
  it("backfills legacy conversations by path without changing their content", async () => {
    const root = mkdtempSync(join(tmpdir(), "synara-workspace-backfill-"));
    try {
      const repository = join(root, "repository");
      const existingWorktree = join(root, "existing-worktree");
      const missingWorktree = join(root, "missing-worktree");
      const deletedWorktree = join(root, "deleted-worktree");
      mkdirSync(repository);
      mkdirSync(existingWorktree);
      execFileSync("git", ["init", "-b", "actual-main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Synara Test"]);
      execFileSync("sh", ["-c", "printf fixture > fixture.txt"], { cwd: repository });
      execFileSync("git", ["-C", repository, "add", "fixture.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-m", "fixture"]);
      const repositoryHead = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();

      const now = "2026-07-15T00:00:00.000Z";
      const projectId = ProjectId.makeUnsafe("project-legacy-backfill");
      const modelSelection = { provider: "codex" as const, model: "gpt-5.5" };
      const legacyThread = (
        id: string,
        title: string,
        worktreePath: string | null,
        branch: string,
        messages: ReadonlyArray<unknown> = [],
      ) =>
        ({
          id: ThreadId.makeUnsafe(id),
          projectId,
          workspaceId: null,
          title,
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "full-access",
          envMode: worktreePath ? "worktree" : "local",
          branch,
          worktreePath,
          associatedWorktreePath: worktreePath,
          associatedWorktreeBranch: branch,
          associatedWorktreeRef: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          latestTurn: null,
          handoff: null,
          messages,
          session: null,
          activities: [],
          proposedPlans: [],
          checkpoints: [],
          deletedAt: null,
        }) as unknown as OrchestrationReadModel["threads"][number];
      const preservedMessage = {
        id: "legacy-message",
        role: "user",
        text: "Keep this conversation exactly as it is.",
        streaming: false,
        source: "native",
        turnId: null,
        createdAt: now,
        updatedAt: now,
      };
      let readModel: OrchestrationReadModel = {
        snapshotSequence: 1,
        projects: [
          {
            id: projectId,
            kind: "project",
            title: "Legacy project",
            workspaceRoot: repository,
            defaultModelSelection: modelSelection,
            scripts: [],
            isPinned: false,
            repositoryIdentity: "github.com/example/legacy-project",
            defaultTargetRef: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ],
        workspaces: [],
        threads: [
          legacyThread("root-thread-1", "Root conversation", null, "stale-main", [
            preservedMessage,
          ]),
          legacyThread("root-thread-2", "Another root conversation", null, "stale-main"),
          {
            ...legacyThread("archived-root-thread", "Archived conversation", null, "stale-main"),
            archivedAt: now,
          },
          legacyThread(
            "existing-worktree-thread",
            "Existing worktree conversation",
            existingWorktree,
            "feature/existing",
          ),
          legacyThread(
            "missing-worktree-thread",
            "Missing worktree conversation",
            missingWorktree,
            "feature/missing",
          ),
          {
            ...legacyThread(
              "deleted-worktree-thread",
              "Deleted conversation",
              deletedWorktree,
              "feature/deleted",
            ),
            deletedAt: now,
          },
        ],
        updatedAt: now,
      };
      const commands: OrchestrationCommand[] = [];
      let sequence = readModel.snapshotSequence;
      const engineLayer = Layer.succeed(OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        getReadModel: () => Effect.sync(() => readModel),
        dispatch: (command) =>
          Effect.gen(function* () {
            commands.push(command);
            const decided = yield* decideOrchestrationCommand({ readModel, command });
            for (const event of Array.isArray(decided) ? decided : [decided]) {
              sequence += 1;
              readModel = yield* projectEvent(readModel, {
                ...event,
                eventId: EventId.makeUnsafe(`legacy-backfill-event-${sequence}`),
                sequence,
              } as OrchestrationEvent);
            }
            return { sequence };
          }),
        repairState: () => Effect.sync(() => readModel),
        refreshCommandReadModel: () => Effect.sync(() => readModel),
        streamDomainEvents: Stream.empty,
      });
      const configLayer = ServerConfig.layerTest(repository, root);
      const gitLayer = GitCoreLive.pipe(
        Layer.provide(configLayer),
        Layer.provide(NodeServices.layer),
      );
      const layer = WorktreeWorkspaceReactorLive.pipe(
        Layer.provideMerge(engineLayer),
        Layer.provideMerge(runtimeSafetyLayer),
        Layer.provideMerge(gitLayer),
        Layer.provideMerge(configLayer),
        Layer.provideMerge(NodeServices.layer),
      );

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const reactor = yield* WorktreeWorkspaceReactor;
            yield* reactor.start;
            const commandCountAfterFirstStart = commands.length;
            yield* reactor.start;
            expect(commands).toHaveLength(commandCountAfterFirstStart);
          }),
        ).pipe(Effect.provide(layer)),
      );

      expect(commands.filter((command) => command.type === "workspace.import-legacy")).toHaveLength(
        3,
      );
      expect(commands.filter((command) => command.type === "thread.workspace.assign")).toHaveLength(
        5,
      );
      const workspaceByPath = new Map(
        (readModel.workspaces ?? []).map((workspace) => [workspace.path, workspace]),
      );
      const canonicalRepository = realpathSync(repository);
      const canonicalExistingWorktree = realpathSync(existingWorktree);
      expect(workspaceByPath.get(canonicalRepository)).toMatchObject({
        kind: "repository-root",
        state: "ready",
        branch: "actual-main",
        headRef: repositoryHead,
      });
      expect(workspaceByPath.get(canonicalExistingWorktree)).toMatchObject({
        kind: "external",
        state: "ready",
        branch: "feature/existing",
        targetRef: "actual-main",
      });
      expect(workspaceByPath.get(missingWorktree)).toMatchObject({
        kind: "external",
        state: "missing",
        branch: "feature/missing",
      });
      expect(workspaceByPath.has(deletedWorktree)).toBe(false);

      const rootThreadOne = readModel.threads.find((thread) => thread.id === "root-thread-1");
      const rootThreadTwo = readModel.threads.find((thread) => thread.id === "root-thread-2");
      expect(rootThreadOne?.workspaceId).toBe(workspaceByPath.get(canonicalRepository)?.id);
      expect(rootThreadTwo?.workspaceId).toBe(rootThreadOne?.workspaceId);
      expect(rootThreadOne).toMatchObject({
        id: "root-thread-1",
        title: "Root conversation",
        modelSelection,
        messages: [preservedMessage],
        archivedAt: null,
        deletedAt: null,
      });
      expect(
        readModel.threads.find((thread) => thread.id === "archived-root-thread"),
      ).toMatchObject({
        workspaceId: rootThreadOne?.workspaceId,
        archivedAt: now,
        deletedAt: null,
      });
      expect(
        readModel.threads.find((thread) => thread.id === "deleted-worktree-thread"),
      ).toMatchObject({
        workspaceId: null,
        deletedAt: now,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates one worktree, runs setup, and records a fenced completion", async () => {
    const root = mkdtempSync(join(tmpdir(), "synara-workspace-reactor-"));
    try {
      const repository = join(root, "repository");
      execFileSync("git", ["init", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Synara Test"]);
      execFileSync("sh", ["-c", "printf fixture > fixture.txt"], { cwd: repository });
      execFileSync("git", ["-C", repository, "add", "fixture.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-m", "fixture"]);
      const head = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const now = new Date().toISOString();
      const projectId = ProjectId.makeUnsafe("project-lifecycle");
      const workspaceId = WorktreeWorkspaceId.makeUnsafe("workspace-lifecycle");
      const operationId = WorkspaceOperationId.makeUnsafe("operation-lifecycle");
      const readModel: OrchestrationReadModel = {
        snapshotSequence: 1,
        projects: [
          {
            id: projectId,
            kind: "project",
            title: "Lifecycle project",
            workspaceRoot: repository,
            defaultModelSelection: null,
            scripts: [
              {
                id: "setup-script",
                name: "Setup",
                command: "printf ready > setup-marker.txt",
                icon: "configure",
                runOnWorktreeCreate: true,
              },
            ],
            isPinned: false,
            repositoryIdentity: repository,
            defaultTargetRef: "main",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ],
        workspaces: [
          {
            id: workspaceId,
            projectId,
            repositoryIdentity: repository,
            kind: "managed",
            state: "provisioning",
            title: "Lifecycle workspace",
            path: null,
            branch: null,
            headRef: null,
            targetRef: "main",
            targetResolvedCommit: null,
            createdFromCommit: null,
            sourceKind: "new-branch",
            sourceRef: "main",
            setupStatus: "pending",
            setupError: null,
            setupLogId: null,
            lastKnownPr: null,
            isPinned: false,
            lifecycleGeneration: 1,
            activeOperation: {
              id: operationId,
              generation: 1,
              kind: "provision",
              stage: "intent-recorded",
              startedAt: now,
            },
            lastFailure: null,
            mutationRevision: 0,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
          },
        ],
        threads: [],
        updatedAt: now,
      };
      const commands: OrchestrationCommand[] = [];
      const engineLayer = Layer.succeed(OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        getReadModel: () => Effect.succeed(readModel),
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command);
            return { sequence: commands.length + 1 };
          }),
        repairState: () => Effect.succeed(readModel),
        refreshCommandReadModel: () => Effect.succeed(readModel),
        streamDomainEvents: Stream.empty,
      });
      const configLayer = ServerConfig.layerTest(repository, root);
      const gitLayer = GitCoreLive.pipe(
        Layer.provide(configLayer),
        Layer.provide(NodeServices.layer),
      );
      const layer = WorktreeWorkspaceReactorLive.pipe(
        Layer.provideMerge(engineLayer),
        Layer.provideMerge(runtimeSafetyLayer),
        Layer.provideMerge(gitLayer),
        Layer.provideMerge(configLayer),
        Layer.provideMerge(NodeServices.layer),
      );

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const reactor = yield* WorktreeWorkspaceReactor;
            yield* reactor.start;
            for (let attempt = 0; attempt < 80 && commands.length === 0; attempt += 1) {
              yield* Effect.sleep(25);
            }
          }),
        ).pipe(Effect.provide(layer)),
      );

      const completion = commands.find(
        (command) => command.type === "workspace.provision.complete",
      );
      expect(completion).toMatchObject({
        workspaceId,
        operationId,
        generation: 1,
        targetResolvedCommit: head,
        createdFromCommit: head,
        setupStatus: "succeeded",
      });
      if (!completion || completion.type !== "workspace.provision.complete") {
        throw new Error("Expected workspace completion command");
      }
      expect(existsSync(join(completion.path, "setup-marker.txt"))).toBe(true);
      expect(
        execFileSync("git", ["-C", repository, "worktree", "list", "--porcelain"], {
          encoding: "utf8",
        }).match(/^worktree /gm),
      ).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks out an existing branch while keeping the default branch as its target", async () => {
    const root = mkdtempSync(join(tmpdir(), "synara-existing-branch-reactor-"));
    try {
      const repository = join(root, "repository");
      execFileSync("git", ["init", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Synara Test"]);
      execFileSync("sh", ["-c", "printf base > fixture.txt"], { cwd: repository });
      execFileSync("git", ["-C", repository, "add", "fixture.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-m", "base"]);
      const targetHead = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["-C", repository, "checkout", "-b", "feature/existing"]);
      execFileSync("sh", ["-c", "printf feature > feature.txt"], { cwd: repository });
      execFileSync("git", ["-C", repository, "add", "feature.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-m", "feature"]);
      const sourceHead = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["-C", repository, "checkout", "main"]);

      const now = new Date().toISOString();
      const projectId = ProjectId.makeUnsafe("project-existing-branch");
      const workspaceId = WorktreeWorkspaceId.makeUnsafe("workspace-existing-branch");
      const operationId = WorkspaceOperationId.makeUnsafe("operation-existing-branch");
      const readModel: OrchestrationReadModel = {
        snapshotSequence: 1,
        projects: [
          {
            id: projectId,
            kind: "project",
            title: "Existing branch project",
            workspaceRoot: repository,
            defaultModelSelection: null,
            scripts: [],
            isPinned: false,
            repositoryIdentity: repository,
            defaultTargetRef: "main",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ],
        workspaces: [
          {
            id: workspaceId,
            projectId,
            repositoryIdentity: repository,
            kind: "managed",
            state: "provisioning",
            title: "Existing branch workspace",
            path: null,
            branch: null,
            headRef: null,
            targetRef: "main",
            targetResolvedCommit: null,
            createdFromCommit: null,
            sourceKind: "branch",
            sourceRef: "feature/existing",
            setupStatus: "pending",
            setupError: null,
            setupLogId: null,
            lastKnownPr: null,
            isPinned: false,
            lifecycleGeneration: 1,
            activeOperation: {
              id: operationId,
              generation: 1,
              kind: "provision",
              stage: "intent-recorded",
              startedAt: now,
            },
            lastFailure: null,
            mutationRevision: 0,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
          },
        ],
        threads: [],
        updatedAt: now,
      };
      const commands: OrchestrationCommand[] = [];
      const engineLayer = Layer.succeed(OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        getReadModel: () => Effect.succeed(readModel),
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command);
            return { sequence: commands.length + 1 };
          }),
        repairState: () => Effect.succeed(readModel),
        refreshCommandReadModel: () => Effect.succeed(readModel),
        streamDomainEvents: Stream.empty,
      });
      const configLayer = ServerConfig.layerTest(repository, root);
      const gitLayer = GitCoreLive.pipe(
        Layer.provide(configLayer),
        Layer.provide(NodeServices.layer),
      );
      const layer = WorktreeWorkspaceReactorLive.pipe(
        Layer.provideMerge(engineLayer),
        Layer.provideMerge(runtimeSafetyLayer),
        Layer.provideMerge(gitLayer),
        Layer.provideMerge(configLayer),
        Layer.provideMerge(NodeServices.layer),
      );

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const reactor = yield* WorktreeWorkspaceReactor;
            yield* reactor.start;
            for (let attempt = 0; attempt < 80 && commands.length === 0; attempt += 1) {
              yield* Effect.sleep(25);
            }
          }),
        ).pipe(Effect.provide(layer)),
      );

      const completion = commands.find(
        (command) => command.type === "workspace.provision.complete",
      );
      expect(completion).toMatchObject({
        workspaceId,
        operationId,
        branch: "feature/existing",
        targetResolvedCommit: targetHead,
        createdFromCommit: sourceHead,
        setupStatus: "skipped",
      });
      if (!completion || completion.type !== "workspace.provision.complete") {
        throw new Error("Expected workspace completion command");
      }
      expect(existsSync(join(completion.path, "feature.txt"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("archives a clean managed worktree without deleting its branch", async () => {
    const root = mkdtempSync(join(tmpdir(), "synara-archive-reactor-"));
    try {
      const repository = join(root, "repository");
      const worktreePath = join(root, "managed-worktree");
      execFileSync("git", ["init", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Synara Test"]);
      execFileSync("sh", ["-c", "printf base > fixture.txt"], { cwd: repository });
      execFileSync("git", ["-C", repository, "add", "fixture.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-m", "base"]);
      execFileSync("git", [
        "-C",
        repository,
        "worktree",
        "add",
        "-b",
        "feature/archive-me",
        worktreePath,
        "main",
      ]);
      const head = execFileSync("git", ["-C", worktreePath, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const now = new Date().toISOString();
      const projectId = ProjectId.makeUnsafe("project-archive-reactor");
      const workspaceId = WorktreeWorkspaceId.makeUnsafe("workspace-archive-reactor");
      const operationId = WorkspaceOperationId.makeUnsafe("operation-archive-reactor");
      const readModel: OrchestrationReadModel = {
        snapshotSequence: 1,
        projects: [
          {
            id: projectId,
            kind: "project",
            title: "Archive project",
            workspaceRoot: repository,
            defaultModelSelection: null,
            scripts: [],
            isPinned: false,
            repositoryIdentity: repository,
            defaultTargetRef: "main",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ],
        workspaces: [
          {
            id: workspaceId,
            projectId,
            repositoryIdentity: repository,
            kind: "managed",
            state: "archiving",
            title: "Archive me",
            path: worktreePath,
            branch: "feature/archive-me",
            headRef: head,
            targetRef: "main",
            targetResolvedCommit: head,
            createdFromCommit: head,
            sourceKind: "new-branch",
            sourceRef: "main",
            setupStatus: "skipped",
            setupError: null,
            setupLogId: null,
            lastKnownPr: null,
            isPinned: false,
            lifecycleGeneration: 2,
            activeOperation: {
              id: operationId,
              generation: 2,
              kind: "archive",
              stage: "intent-confirmed",
              startedAt: now,
            },
            lastFailure: null,
            mutationRevision: 0,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
          },
        ],
        threads: [],
        updatedAt: now,
      };
      const commands: OrchestrationCommand[] = [];
      const engineLayer = Layer.succeed(OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        getReadModel: () => Effect.succeed(readModel),
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command);
            return { sequence: commands.length + 1 };
          }),
        repairState: () => Effect.succeed(readModel),
        refreshCommandReadModel: () => Effect.succeed(readModel),
        streamDomainEvents: Stream.empty,
      });
      const configLayer = ServerConfig.layerTest(repository, root);
      const gitLayer = GitCoreLive.pipe(
        Layer.provide(configLayer),
        Layer.provide(NodeServices.layer),
      );
      const layer = WorktreeWorkspaceReactorLive.pipe(
        Layer.provideMerge(engineLayer),
        Layer.provideMerge(runtimeSafetyLayer),
        Layer.provideMerge(gitLayer),
        Layer.provideMerge(configLayer),
        Layer.provideMerge(NodeServices.layer),
      );

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* (yield* WorktreeWorkspaceReactor).start;
            for (let attempt = 0; attempt < 80 && commands.length === 0; attempt += 1) {
              yield* Effect.sleep(25);
            }
          }),
        ).pipe(Effect.provide(layer)),
      );

      expect(commands).toContainEqual(
        expect.objectContaining({
          type: "workspace.archive.complete",
          workspaceId,
          operationId,
          generation: 2,
        }),
      );
      expect(existsSync(worktreePath)).toBe(false);
      expect(
        execFileSync("git", [
          "-C",
          repository,
          "show-ref",
          "--verify",
          "--quiet",
          "refs/heads/feature/archive-me",
        ]),
      ).toBeDefined();

      const restoreOperationId = WorkspaceOperationId.makeUnsafe("operation-restore-reactor");
      const archivedWorkspace = readModel.workspaces[0]!;
      readModel.workspaces[0] = {
        ...archivedWorkspace,
        state: "provisioning",
        lifecycleGeneration: 3,
        activeOperation: {
          id: restoreOperationId,
          generation: 3,
          kind: "restore",
          stage: "intent-recorded",
          startedAt: now,
        },
        archivedAt: now,
      };
      commands.length = 0;

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* (yield* WorktreeWorkspaceReactor).start;
            for (let attempt = 0; attempt < 80 && commands.length === 0; attempt += 1) {
              yield* Effect.sleep(25);
            }
          }),
        ).pipe(Effect.provide(layer)),
      );

      expect(commands).toContainEqual(
        expect.objectContaining({
          type: "workspace.restore.complete",
          workspaceId,
          operationId: restoreOperationId,
          generation: 3,
          path: worktreePath,
          branch: "feature/archive-me",
          headRef: head,
        }),
      );
      expect(existsSync(worktreePath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

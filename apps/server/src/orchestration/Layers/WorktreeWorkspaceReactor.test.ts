import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProjectId,
  WorktreeWorkspaceId,
  WorkspaceOperationId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@synara/contracts";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { ServerConfig } from "../../config";
import { GitCoreLive } from "../../git/Layers/GitCore";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine";
import { WorktreeWorkspaceReactor } from "../Services/WorktreeWorkspaceReactor";
import {
  resolveWorkspaceBranchProvisioning,
  WorktreeWorkspaceReactorLive,
} from "./WorktreeWorkspaceReactor";

describe("resolveWorkspaceBranchProvisioning", () => {
  it("checks out a free local branch without changing its identity", () => {
    expect(
      resolveWorkspaceBranchProvisioning({
        sourceKind: "branch",
        targetRef: "feature/existing",
        resolvedCommit: "abc123",
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
        targetRef: "origin/feature/existing",
        resolvedCommit: "abc123",
        generatedBranch: "synara/generated",
        localBranchExists: false,
        remotes: ["origin"],
      }),
    ).toEqual({ branch: "origin/feature/existing", newBranch: "feature/existing" });
  });
});

describe("WorktreeWorkspaceReactor", () => {
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
});

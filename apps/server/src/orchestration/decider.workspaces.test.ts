import {
  CommandId,
  EventId,
  ProjectId,
  ThreadId,
  WorktreeWorkspaceId,
  WorkspaceOperationId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@synara/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const modelSelection = { provider: "codex" as const, model: "gpt-5.5" };

async function apply(
  readModel: OrchestrationReadModel,
  events: ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
): Promise<OrchestrationReadModel> {
  let next = readModel;
  for (const [index, event] of events.entries()) {
    next = await Effect.runPromise(
      projectEvent(next, {
        ...event,
        sequence: readModel.snapshotSequence + index + 1,
        eventId: EventId.makeUnsafe(`workspace-event-${readModel.snapshotSequence + index + 1}`),
      } as OrchestrationEvent),
    );
  }
  return next;
}

async function repositoryProject(now: string) {
  const empty = createEmptyReadModel(now);
  const result = await Effect.runPromise(
    decideOrchestrationCommand({
      readModel: empty,
      command: {
        type: "project.create",
        commandId: CommandId.makeUnsafe("workspace-project-create"),
        projectId: ProjectId.makeUnsafe("workspace-project"),
        title: "Workspace project",
        workspaceRoot: "/tmp/workspace-project",
        repositoryIdentity: "repo:workspace-project",
        defaultTargetRef: "main",
        createdAt: now,
      },
    }),
  );
  return apply(empty, Array.isArray(result) ? result : [result]);
}

describe("worktree workspace commands", () => {
  it("atomically creates a workspace and its first conversation", async () => {
    const now = new Date().toISOString();
    const readModel = await repositoryProject(now);
    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel,
        command: {
          type: "workspace.create",
          commandId: CommandId.makeUnsafe("workspace-create"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-1"),
          threadId: ThreadId.makeUnsafe("workspace-thread-1"),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          operationId: WorkspaceOperationId.makeUnsafe("workspace-operation-1"),
          title: "Feature workspace",
          targetRef: "main",
          branch: "amir/feature-workspace",
          sourceRef: "main",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );

    expect(Array.isArray(result)).toBe(true);
    const events = Array.isArray(result) ? result : [result];
    expect(events.map((event) => event.type)).toEqual(["workspace.created", "thread.created"]);
    expect(events[0]?.payload).toMatchObject({
      branch: "amir/feature-workspace",
      sourceRef: "main",
      targetRef: "main",
    });
    expect(events[1]?.payload).toMatchObject({
      workspaceId: "workspace-1",
      worktreePath: null,
    });
  });

  it("adds another conversation without emitting a workspace lifecycle event", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const created = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: initial,
        command: {
          type: "workspace.create",
          commandId: CommandId.makeUnsafe("workspace-create-for-sibling"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-sibling"),
          threadId: ThreadId.makeUnsafe("workspace-thread-first"),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          operationId: WorkspaceOperationId.makeUnsafe("workspace-operation-sibling"),
          title: "Sibling workspace",
          targetRef: "main",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );
    const readModel = await apply(initial, Array.isArray(created) ? created : [created]);
    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel,
        command: {
          type: "workspace.conversation.create",
          commandId: CommandId.makeUnsafe("workspace-add-conversation"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-sibling"),
          threadId: ThreadId.makeUnsafe("workspace-thread-second"),
          title: "Second conversation",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );

    expect(Array.isArray(result)).toBe(false);
    const event = (Array.isArray(result) ? result[0] : result) as Omit<
      OrchestrationEvent,
      "sequence"
    >;
    expect(event.type).toBe("thread.created");
    expect(event.payload).toMatchObject({ workspaceId: "workspace-sibling" });
  });

  it("attaches an existing pull-request worktree and updates its display metadata", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const attached = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: initial,
        command: {
          type: "workspace.attach",
          commandId: CommandId.makeUnsafe("workspace-attach-pr"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-pr"),
          threadId: ThreadId.makeUnsafe("workspace-pr-thread"),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          title: "Review checkout",
          path: "/tmp/workspace-pr",
          branch: "feature/review",
          headRef: null,
          targetRef: "main",
          sourceKind: "pull-request",
          sourceRef: "https://github.com/example/repo/pull/42",
          lastKnownPr: {
            number: 42,
            title: "Review checkout",
            url: "https://github.com/example/repo/pull/42",
            baseBranch: "main",
            headBranch: "feature/review",
            state: "open",
          },
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );
    const readModel = await apply(initial, Array.isArray(attached) ? attached : [attached]);
    const sibling = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel,
        command: {
          type: "workspace.conversation.create",
          commandId: CommandId.makeUnsafe("workspace-pr-sibling"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-pr"),
          threadId: ThreadId.makeUnsafe("workspace-pr-thread-2"),
          title: "Review follow-up",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );
    const siblingEvent = (Array.isArray(sibling) ? sibling[0] : sibling) as Omit<
      OrchestrationEvent,
      "sequence"
    >;
    expect(siblingEvent.payload).toMatchObject({
      workspaceId: "workspace-pr",
      lastKnownPr: {
        number: 42,
        url: "https://github.com/example/repo/pull/42",
      },
    });
    const readModelWithSibling = await apply(
      readModel,
      Array.isArray(sibling) ? sibling : [sibling],
    );
    const renamed = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: readModelWithSibling,
        command: {
          type: "workspace.meta.update",
          commandId: CommandId.makeUnsafe("workspace-rename"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-pr"),
          title: "Shipping details",
          branch: "feature/shipping-details",
          targetRef: "develop",
          lastKnownPr: {
            number: 42,
            title: "Shipping details",
            url: "https://github.com/example/repo/pull/42",
            baseBranch: "develop",
            headBranch: "feature/shipping-details",
            state: "merged",
          },
          updatedAt: now,
        },
      }),
    );
    const finalModel = await apply(
      readModelWithSibling,
      Array.isArray(renamed) ? renamed : [renamed],
    );

    expect(finalModel.workspaces?.[0]).toMatchObject({
      title: "Shipping details",
      branch: "feature/shipping-details",
      targetRef: "develop",
      sourceKind: "pull-request",
      mutationRevision: 1,
      lastKnownPr: { number: 42, state: "merged" },
    });
    expect(finalModel.threads).toHaveLength(2);
    for (const thread of finalModel.threads) {
      expect(thread).toMatchObject({
        workspaceId: "workspace-pr",
        branch: "feature/shipping-details",
        lastKnownPr: { number: 42, state: "merged" },
      });
    }

    const unlinked = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: finalModel,
        command: {
          type: "workspace.meta.update",
          commandId: CommandId.makeUnsafe("workspace-unlink-pr"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-pr"),
          lastKnownPr: null,
          updatedAt: now,
        },
      }),
    );
    const unlinkedModel = await apply(finalModel, Array.isArray(unlinked) ? unlinked : [unlinked]);
    expect(unlinkedModel.workspaces?.[0]?.lastKnownPr).toBeNull();
    expect(unlinkedModel.threads.every((thread) => thread.lastKnownPr === null)).toBe(true);
  });

  it("rejects a second active workspace for the same canonical pull request", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const makeAttach = (suffix: string, url: string) => ({
      type: "workspace.attach" as const,
      commandId: CommandId.makeUnsafe(`workspace-attach-${suffix}`),
      workspaceId: WorktreeWorkspaceId.makeUnsafe(`workspace-${suffix}`),
      threadId: ThreadId.makeUnsafe(`thread-${suffix}`),
      projectId: ProjectId.makeUnsafe("workspace-project"),
      title: `Review ${suffix}`,
      path: `/tmp/workspace-${suffix}`,
      branch: `feature/${suffix}`,
      headRef: null,
      targetRef: "main",
      sourceKind: "pull-request" as const,
      sourceRef: url,
      lastKnownPr: {
        number: 42,
        title: `Review ${suffix}`,
        url,
        baseBranch: "main",
        headBranch: `feature/${suffix}`,
        state: "open" as const,
      },
      modelSelection,
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      createdAt: now,
    });
    const first = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: initial,
        command: makeAttach("first", "https://github.com/Acme/Repo/pull/42"),
      }),
    );
    const readModel = await apply(initial, Array.isArray(first) ? first : [first]);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          readModel,
          command: makeAttach("second", "https://github.com/acme/repo/pull/42/"),
        }),
      ),
    ).rejects.toThrow("already attached to workspace 'workspace-first'");
  });

  it("rejects duplicate pull-request workspaces identified only by canonical source refs", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const makeAttach = (suffix: string, url: string) => ({
      type: "workspace.attach" as const,
      commandId: CommandId.makeUnsafe(`workspace-source-attach-${suffix}`),
      workspaceId: WorktreeWorkspaceId.makeUnsafe(`workspace-source-${suffix}`),
      threadId: ThreadId.makeUnsafe(`thread-source-${suffix}`),
      projectId: ProjectId.makeUnsafe("workspace-project"),
      title: `Source review ${suffix}`,
      path: `/tmp/workspace-source-${suffix}`,
      branch: `feature/source-${suffix}`,
      headRef: null,
      targetRef: "main",
      sourceKind: "pull-request" as const,
      sourceRef: url,
      modelSelection,
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      createdAt: now,
    });
    const first = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: initial,
        command: makeAttach("first", "https://github.com/Acme/Repo/pull/42"),
      }),
    );
    const readModel = await apply(initial, Array.isArray(first) ? first : [first]);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          readModel,
          command: makeAttach("second", "https://github.com/acme/repo/pull/42/files"),
        }),
      ),
    ).rejects.toThrow("already attached to workspace 'workspace-source-first'");
  });

  it("rejects metadata association when another workspace source ref owns the pull request", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const attach = (input: {
      readonly suffix: string;
      readonly sourceKind: "branch" | "pull-request";
      readonly sourceRef: string;
    }) =>
      decideOrchestrationCommand({
        readModel: initial,
        command: {
          type: "workspace.attach",
          commandId: CommandId.makeUnsafe(`workspace-meta-attach-${input.suffix}`),
          workspaceId: WorktreeWorkspaceId.makeUnsafe(`workspace-meta-${input.suffix}`),
          threadId: ThreadId.makeUnsafe(`thread-meta-${input.suffix}`),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          title: `Metadata ${input.suffix}`,
          path: `/tmp/workspace-meta-${input.suffix}`,
          branch: `feature/meta-${input.suffix}`,
          headRef: null,
          targetRef: "main",
          sourceKind: input.sourceKind,
          sourceRef: input.sourceRef,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      });
    const first = await Effect.runPromise(
      attach({
        suffix: "owner",
        sourceKind: "pull-request",
        sourceRef: "https://github.com/Acme/Repo/pull/42",
      }),
    );
    let readModel = await apply(initial, Array.isArray(first) ? first : [first]);
    const second = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel,
        command: {
          type: "workspace.attach",
          commandId: CommandId.makeUnsafe("workspace-meta-attach-candidate"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-meta-candidate"),
          threadId: ThreadId.makeUnsafe("thread-meta-candidate"),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          title: "Metadata candidate",
          path: "/tmp/workspace-meta-candidate",
          branch: "feature/meta-candidate",
          headRef: null,
          targetRef: "main",
          sourceKind: "branch",
          sourceRef: "feature/meta-candidate",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );
    readModel = await apply(readModel, Array.isArray(second) ? second : [second]);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          readModel,
          command: {
            type: "workspace.meta.update",
            commandId: CommandId.makeUnsafe("workspace-meta-link-candidate"),
            workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-meta-candidate"),
            lastKnownPr: {
              number: 42,
              title: "Canonical PR",
              url: "https://github.com/acme/repo/pull/42/",
              baseBranch: "main",
              headBranch: "feature/meta-candidate",
              state: "open",
            },
            updatedAt: now,
          },
        }),
      ),
    ).rejects.toThrow("already attached to workspace 'workspace-meta-owner'");
  });

  it("rejects a stale provisioning completion generation", async () => {
    const now = new Date().toISOString();
    const initial = await repositoryProject(now);
    const created = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel: initial,
        command: {
          type: "workspace.create",
          commandId: CommandId.makeUnsafe("workspace-create-for-fence"),
          workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-fence"),
          threadId: ThreadId.makeUnsafe("workspace-thread-fence"),
          projectId: ProjectId.makeUnsafe("workspace-project"),
          operationId: WorkspaceOperationId.makeUnsafe("workspace-operation-fence"),
          title: "Fenced workspace",
          targetRef: "main",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );
    const readModel = await apply(initial, Array.isArray(created) ? created : [created]);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          readModel,
          command: {
            type: "workspace.provision.complete",
            commandId: CommandId.makeUnsafe("workspace-stale-completion"),
            workspaceId: WorktreeWorkspaceId.makeUnsafe("workspace-fence"),
            operationId: WorkspaceOperationId.makeUnsafe("workspace-operation-fence"),
            generation: 2,
            path: "/tmp/workspace-fence",
            branch: "synara/workspace-fence",
            headRef: "abc123",
            targetResolvedCommit: "abc123",
            createdFromCommit: "abc123",
            setupStatus: "skipped",
            completedAt: now,
          },
        }),
      ),
    ).rejects.toThrow(/Stale workspace completion/);
  });
});

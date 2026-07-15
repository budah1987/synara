// FILE: _chat.index.tsx
// Purpose: Restores the last chat route on app launch, falling back to a fresh home-chat draft.
// Layer: Routing
// Depends on: the shared restore/create route surface plus the home-chat new-chat handler.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
  RestoreOrCreateChatRoute,
  type RestoreRouteResolver,
} from "../components/RestoreOrCreateChatRoute";
import { SplashScreen } from "../components/SplashScreen";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import {
  collectKnownThreadIds,
  resolveRestorableThreadRouteWithFallback,
} from "../chatRouteRestore";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { collectStudioProjectIds } from "../lib/studioProjects";
import { EMPTY_THREAD_IDS, useStore } from "../store";
import { useWorkspaceStore } from "../workspaceStore";
import { useRecentViewsStore } from "../recentViewsStore";

function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const threadIds = useStore((state) => state.threadIds ?? EMPTY_THREAD_IDS);
  const projects = useStore((state) => state.projects);
  const sidebarThreadSummaryById = useStore((state) => state.sidebarThreadSummaryById);
  const recentViews = useRecentViewsStore((state) => state.recentViews);
  const recentViewsHydrated = useRecentViewsStore((state) => state.hasHydrated);
  const draftThreadsByThreadId = useComposerDraftStore((state) => state.draftThreadsByThreadId);
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspaceStore((state) => state.chatWorkspaceRoot);
  const studioWorkspaceRoot = useWorkspaceStore((state) => state.studioWorkspaceRoot);
  const createFreshChat = useCallback(() => handleNewChat({ fresh: true }), [handleNewChat]);

  // Home chats restore the last visited route, except Studio threads — those belong to the
  // /studio surface, and restoring one from "/" would silently switch the user into the Studio
  // segment. A Studio lastThreadRoute falls through to a fresh home-chat draft instead.
  const studioProjectIds = useMemo(
    () => collectStudioProjectIds(projects, { homeDir, chatWorkspaceRoot, studioWorkspaceRoot }),
    [chatWorkspaceRoot, homeDir, projects, studioWorkspaceRoot],
  );
  const recentThreadRoutes = useMemo(
    () =>
      recentViews.flatMap((view) =>
        view.kind === "thread"
          ? [
              {
                threadId: view.threadId,
                ...(view.splitViewId ? { splitViewId: view.splitViewId } : {}),
              },
            ]
          : [],
      ),
    [recentViews],
  );
  // Fresh unsent chats have a route id but no persisted sidebar summary yet, so the thread-id
  // filter above never matches them — mirrors the /studio landing's draft handling (and
  // Sidebar's segment-scoped draft sets) so a cold start on "/" can restore an unsent home draft
  // instead of always minting a new one. Only plain, still-unsent chat drafts qualify: a
  // non-"chat" entry point isn't a home-chat draft, and `promotedTo` means the draft already
  // became a real thread, so its stale id is no longer a valid restore target (matches the
  // filtering findStudioDraftThreadId applies when picking Studio's current draft).
  const nonStudioDraftThreadIds = useMemo(() => {
    const draftThreadIds = new Set<string>();
    for (const [threadId, draft] of Object.entries(draftThreadsByThreadId)) {
      if (
        !studioProjectIds.has(draft.projectId) &&
        draft.entryPoint === "chat" &&
        draft.promotedTo === undefined
      ) {
        draftThreadIds.add(threadId);
      }
    }
    return draftThreadIds;
  }, [draftThreadsByThreadId, studioProjectIds]);
  const resolveRestoreRoute = useCallback<RestoreRouteResolver>(
    ({ availableSplitViewIds }) => {
      const classifiedThreadIds = threadIds.filter((threadId) => {
        // Fail closed: a thread we can't classify is not restorable from "/". Summaries are
        // normally built from the same snapshot as threadIds.
        const summary = sidebarThreadSummaryById[threadId];
        return summary !== undefined && !studioProjectIds.has(summary.projectId);
      });
      const workspaceConversationIds = Object.values(sidebarThreadSummaryById)
        .filter(
          (summary): summary is NonNullable<typeof summary> =>
            summary !== undefined && !studioProjectIds.has(summary.projectId),
        )
        .map((summary) => summary.id);
      const availableThreadIds = collectKnownThreadIds({
        threadIds: classifiedThreadIds,
        sidebarThreadSummaryIds: workspaceConversationIds,
      });
      for (const draftThreadId of nonStudioDraftThreadIds) {
        availableThreadIds.add(draftThreadId);
      }
      return resolveRestorableThreadRouteWithFallback({
        lastThreadRoute: readSidebarUiState().lastThreadRoute,
        fallbackRoutes: recentThreadRoutes,
        availableThreadIds,
        availableSplitViewIds,
      });
    },
    [
      nonStudioDraftThreadIds,
      recentThreadRoutes,
      sidebarThreadSummaryById,
      studioProjectIds,
      threadIds,
    ],
  );
  const shouldRecoverUnresolvedRememberedRoute = useCallback(
    (lastThreadRoute: { threadId: string }) => {
      const summary = sidebarThreadSummaryById[lastThreadRoute.threadId];
      return summary === undefined || !studioProjectIds.has(summary.projectId);
    },
    [sidebarThreadSummaryById, studioProjectIds],
  );

  if (!recentViewsHydrated) {
    return <SplashScreen />;
  }

  return (
    <RestoreOrCreateChatRoute
      resolveRestoreRoute={resolveRestoreRoute}
      createFreshChat={createFreshChat}
      fallbackRestoreRoute={recentThreadRoutes[0] ?? null}
      shouldRecoverUnresolvedRememberedRoute={shouldRecoverUnresolvedRememberedRoute}
    />
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

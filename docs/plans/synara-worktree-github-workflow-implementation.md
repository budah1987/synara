# Implementation Plan — Worktrees, GitHub, and Pull Request Workflow

> **Fable operating mandate:** Review this plan before implementation, then act as the parent
> orchestrator and project manager through completion. Delegate meaningful work across Codex Sol,
> Codex Terra, Sonnet, and Opus using the routing rules below. Keep the user informed with precise,
> salient status updates, completion percentage, current work, risks, verification, and any decision
> that needs their input. Do not silently reinterpret a settled product decision.

## 1. What we are building

Synara should treat a repository as a container, a workspace/worktree as the unit where work runs,
and a pull request as the review object attached to that workspace. The UI should make the local to
GitHub lifecycle understandable to a GitHub newcomer without hiding the real Git state.

The complete product loop is:

```text
Workspace -> commit -> publish branch -> create PR -> review/fix -> merge on GitHub -> archive

Incoming PR -> open/create workspace -> review/fix -> push updates -> same PR -> archive after merge
```

This initiative has five user-facing outcomes:

1. Worktree rows have complete, correctly scoped actions, including a real context menu.
2. Synara distinguishes local branches, published branches, open PRs, and merged PRs without
   manufacturing GitHub URLs that may not exist.
3. The new Pull Request tab becomes a two-way workspace/PR hub rather than a one-way checkout picker.
4. Workspaces can be archived and restored without deleting their conversations or accidentally
   losing local work.
5. File browsing remains available in repositories with very large Git status output; Git metadata
   may degrade to a bounded partial summary, but it must not take the workspace explorer down with it.

## 2. Orchestration and project-management instructions

Fable owns planning, dependency management, task assignment, integration, review, and user updates.
Fable should not hand the whole plan to one implementation agent. Split it into bounded work packages,
keep overlapping files serialized, and use isolated worktrees for parallel implementation.

### Required model use

Use every model family below for substantive work, not ceremonial summaries:

| Model           | Effort      | Best use in this initiative                                                                                                 |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Codex Sol**   | medium/high | Repository inventory, mechanical contracts/plumbing, focused tests, migrations, and well-scoped fixes                       |
| **Codex Terra** | high/xhigh  | Cross-layer Git/orchestration architecture, lifecycle state machines, GitHub identity, and high-risk backend implementation |
| **Sonnet**      | high/xhigh  | User-facing React implementation, context menus, interaction states, accessibility, and UI integration                      |
| **Opus**        | high/x-high | Initial plan challenge, high-complexity architecture/UX review, difficult debugging, and final independent review           |

Suggested first review pass:

- Opus x-high: challenge the product flow, destructive-action safeguards, and GitHub-newcomer UX.
- Codex Terra xhigh: challenge the domain model, event transitions, Git/GitHub authority, restart
  recovery, and concurrency.
- Sonnet high: review the proposed menus, PR browser, progressive disclosure, and copy.
- Codex Sol medium: produce a drift-aware file/test inventory and identify existing code that should
  be reused instead of duplicated.

Fable must synthesize those reviews into one implementation sequence. If a reviewer proposes a
material change to the settled decisions in Section 5, report the tradeoff to the user before changing
the plan.

### Parallel-work rules

- Use isolated agent worktrees and explicit file ownership for concurrent tasks.
- `apps/web/src/components/Sidebar.tsx` is a merge-conflict hotspot. Only one active implementer may
  own it at a time. Prefer extracting focused components before parallel UI work continues.
- Contracts must land before consumers that depend on new fields or commands.
- Do not let two agents independently invent Git/PR state resolvers. One shared resolver and one
  shared vocabulary must serve the sidebar, worktree menus, PR browser, and Environment panel.
- Every delegated task must return changed files, tests run, results, assumptions, and unresolved risk.
- Fable reviews each result before integration; a passing child report is not the integration gate.

### User update protocol

Send an update:

- after the initial review synthesis;
- when each weighted phase starts and completes;
- whenever a delegated task fails, stalls, changes scope, or exposes a user-facing decision;
- at least once during a long-running phase even if it remains healthy; and
- after final verification.

Use this compact format:

```text
Status — 38%
Completed: ...
In progress: ...
Next: ...
Risks/issues: ...
Decision needed: none | <precise question, options, recommendation>
Verification: ...
```

Completion percentage is weighted progress, not the percentage of child tasks that have returned:

| Phase                                                            | Weight |
| ---------------------------------------------------------------- | -----: |
| 0. Review, drift audit, and baseline                             |     8% |
| 1. Canonical GitHub/workspace/PR state and Git-status resilience |    22% |
| 2. Sidebar ownership, hover states, and context menus            |    18% |
| 3. Workspace-scoped dev-server actions                           |    10% |
| 4. Two-way Pull Request hub                                      |    25% |
| 5. Archive and restore lifecycle                                 |    12% |
| 6. Integrated QA, polish, and final verification                 |     5% |

Do not report a phase complete until its focused tests and exit criteria pass.

## 3. Repository baseline and drift warning

This plan was written on 2026-07-15 against:

```text
Repository: /Users/amir/Documents/Synara-workspaces-v2
HEAD: 32d710fa feat: surface worktree activity and tab shortcuts
Branch: synara/conductor-worktree-conversations
```

The checkout was dirty while this plan was created. Relevant uncommitted work included the workspace
creation flow, Sidebar, workspace reactor/decider, GitHub CLI behavior, keybindings, desktop main
process, and orchestration contracts. Treat every existing change as user-owned. Do not reset, clean,
overwrite, or casually stash it.

Phase 0 must begin with:

```bash
git status --short
git diff --stat
git diff -- apps/web/src/components/Sidebar.tsx \
  apps/web/src/components/WorktreeWorkspaceCreateDialog.tsx \
  apps/server/src/orchestration/Layers/WorktreeWorkspaceReactor.ts \
  apps/server/src/orchestration/decider.ts \
  packages/contracts/src/orchestration.ts
```

If the working changes cannot be safely inherited by isolated implementation worktrees, Fable must
explain the options and ask the user before creating a checkpoint commit, moving changes, or choosing
a different integration base. Do not solve this with a destructive Git command.

Read and follow `AGENTS.md` and `CLAUDE.md` before implementation. In particular:

- use `bun run test`, never `bun test`;
- preserve event-driven correctness, idempotency, and predictable restart behavior;
- keep `packages/contracts` schema-only;
- extract shared logic instead of duplicating it across sidebar, PR, and Environment surfaces; and
- use the shared disclosure motion for any newly introduced open/close UI.

## 4. Current implementation that must be reused

The latest code already contains meaningful parts of the desired workflow:

- `apps/web/src/components/WorktreeWorkspaceCreateDialog.tsx` has New branch, Existing branch, and
  Pull request source tabs, searchable PR rows, and GitHub filters.
- `apps/web/src/components/WorktreeWorkspaceRenameDialog.tsx` already separates the display name from
  the optional local branch rename and prevents Synara from renaming published branches.
- `apps/web/src/components/WorktreeWorkspaceHoverCardContent.tsx` already displays branch, path,
  source, state, and conversation count, but it links any syntactically constructed branch URL.
- `apps/web/src/components/chat/environment/EnvironmentPullRequestSection.tsx` already loads PR
  checks, unresolved review comments, conflicts, and drafts agent-ready Fix prompts.
- `apps/server/src/git/Layers/GitManager.ts` already supports listing/resolving PRs, PR snapshots,
  cross-repository PR worktrees, commit/push/PR actions, and ff-only pulls.
- `apps/server/src/orchestration/Layers/WorktreeWorkspaceReactor.ts` already provisions managed
  worktrees with generation-checked operations and setup scripts.
- `apps/server/src/git/Layers/GitCore.ts` currently caps captured command output at 1,000,000 bytes
  and treats an oversized `git status --porcelain=2 --branch` response as a failed status operation.
- `OrchestrationWorktreeWorkspace` already contains `lastKnownPr`, archive-related states, operation
  kinds, and timestamps, though archive/restore commands and reactor execution are not implemented.
- The desktop `shell.showInFolder` implementation already opens directories and reveals files.

Extend these paths. Do not introduce a second PR client, a second workspace store, or a parallel menu
system.

## 5. Settled product decisions

These decisions have already been made and do not need to be re-litigated during implementation:

1. **Branches remain local until explicit publication.** Creating a workspace must not push it.
2. **A local-only branch has no GitHub branch link.** Its hover card offers the local path through
   Show in Finder/File Explorer instead.
3. **A GitHub branch link appears only after publication is verified.** Use authoritative Git/GitHub
   data and returned URLs; never guess that a remote branch exists from a local name.
4. **Workspace display identity and Git identity are separate.** Rename workspace always changes the
   visual label. Local branch rename is optional and is disabled after publication or PR creation.
5. **Workspace actions belong on the workspace.** Files, terminals, dev process, Git actions, PR
   actions, rename, pin, and archive are scoped to the selected worktree path.
6. **Repository actions remain on the project.** Repository Finder, Kanban, repository GitHub link,
   project settings/name/pin, creation of a workspace, and project removal remain project-level.
7. **Archive is the default workspace cleanup action.** It removes a managed local worktree while
   retaining conversations and workspace history. Remote branch deletion is separate and default-off.
8. **One PR maps to at most one active Synara workspace per project.** Opening the PR again opens or
   adds a conversation to the existing workspace; it does not create a duplicate worktree.
9. **PR identity belongs to the workspace, not one conversation.** All sibling conversations share
   the same current PR state.
10. **Merging remains on GitHub in this run.** Synara may report Ready to merge and open GitHub, but
    it will not merge, approve, or submit GitHub reviews natively.
11. **Pull means ff-only from the current branch upstream.** Do not label it as updating from the
    workspace target branch. Rebase/update-from-main automation is out of scope.
12. **The repository root is an explicit workspace row.** Label it `Repository root`; do not present
    its folder name as though it were another managed worktree.

## 6. Scope boundaries

### In scope

- Persistent per-project GitHub account selection and consistent use by GitHub-backed operations.
- Workspace-level PR association and projection to every workspace conversation.
- Authoritative local/published/PR/merged state and safe branch links.
- Worktree hover improvements and platform-appropriate folder reveal.
- Worktree and revised project context menus, including keyboard access.
- Workspace-scoped dev-server actions and state.
- A reusable, two-way Pull Request browser based on the existing PR source tab.
- Managed-workspace archive, restore, safety checks, and archived-workspace discovery.
- Bounded, truncation-aware Git status handling and isolation between Git metadata failures and the
  file explorer.
- Focused unit/integration/browser coverage and a final full verification pass.

### Out of scope

- Native PR merge, approval, review submission, or branch-protection administration.
- Automatic rebase/update-from-target workflows.
- Remote branch rename.
- Automatic remote branch deletion during archive.
- A full GitHub issue/notification client.
- A full native PR diff viewer if it requires a new diff engine; opening GitHub Files is acceptable.
- Broad Kanban redesign.
- Mobile parity for these desktop worktree actions.

## 7. Target domain model

The implementation should converge on these ownership rules:

```text
Project
  repository root
  repository identity
  selected GitHub account
  default target branch
  scripts/settings

Workspace
  display title
  kind: managed | repository-root | external
  local path and branch
  target branch
  publication state
  associated PR
  archive/restore lifecycle
  zero or more conversations
  zero or one tracked dev server
```

Define one shared workspace Git presentation state, with overlays for draft/conflicts/checks:

```text
unavailable | provisioning | local-only | published | pr-open | pr-closed | pr-merged
```

This presentation state is derived, not separately editable. Its inputs are the workspace record,
live local Git status, verified remote publication, and live/persisted PR state.

Important authority rules:

- `workspace.path` is the CWD for commit, push, pull, diff, terminal, and dev-server actions.
- `workspace.targetRef` is the preferred PR base and must be supplied to PR creation.
- `workspace.lastKnownPr` is the durable association; live GitHub data refreshes it when available.
- `project.githubAccount` (exact field name may follow repo naming) selects credentials for all `gh`
  operations for that project without changing the global active account.
- GitHub URLs come from resolved repository/PR data or a verified published remote ref.
- Query and polling identity should be workspace/PR based, not duplicated once per sibling thread.

## 8. Phase 0 — Review, drift audit, and baseline

### Tasks

1. Run the drift commands in Section 3 and inventory all relevant uncommitted changes.
2. Run the required parallel review pass described in Section 2.
3. Map existing tests and identify the smallest focused command for every later work package.
4. Produce a short synthesis covering accepted plan changes, rejected suggestions, worktree/file
   ownership, dependency order, and any decision requiring the user.
5. Establish an integration strategy that preserves the current dirty state.

### Exit criteria

- The user receives the first status report and any required dirty-worktree decision.
- Every implementation package has one owner, one integration order, and explicit files/tests.
- No child agent begins edits against an ambiguous or unsafe base.

## 9. Phase 1 — Canonical GitHub, workspace, and PR state and Git-status resilience

This phase is foundational and should land before the major UI changes.

### 9.1 Persist project GitHub identity

Add a nullable GitHub account selection to the project create/update, shell/detail, event payload, and
projection schemas with backward-compatible defaults. When cloning a GitHub repository, persist the
selected `{host, login}` on the created/recovered project.

Ensure every GitHub-backed operation can use that project account without mutating global `gh auth`
state:

- repository resolution where credentials matter;
- branch/PR status enrichment;
- list/resolve/prepare PR;
- checks and review comments;
- create PR; and
- any GitHub URL/publication lookup added by this plan.

Prefer a shared account-aware GitHub execution boundary over threading ad hoc environment resolution
through individual UI components. If the clean architecture requires optional account data on Git RPC
inputs, keep the schema consistent across all GitHub-backed inputs and centralize the web lookup.

### 9.2 Make PR association workspace-owned

Extend `workspace.meta.update` and `workspace.meta-updated` to support `lastKnownPr`, including null for
explicit unlinking. Project it onto the workspace and, for compatibility, onto all live thread
projections belonging to that workspace.

Change `GitActionsControl` so a created/resolved PR updates the active workspace when `workspaceId` is
present. Legacy non-workspace threads may continue to store thread-level PR metadata.

On hydration or GitHub refresh, prefer live PR data but retain the persisted workspace association if
GitHub is temporarily unavailable. Do not turn an authentication/network failure into “no PR.”

### 9.3 Use the workspace target for PR creation

Add an optional explicit PR base to the stacked Git action input. For workspace conversations, pass
`workspace.targetRef`. The server validates and prefers it; existing default-branch resolution remains
the fallback for legacy callers.

Cover the case where the head and base resolve to the same branch. Preserve the existing safe feature
branch flow for work started on the default branch.

### 9.4 Resolve publication authoritatively

Replace `buildGitHubBranchUrl(repositoryUrl, branch)` as the condition for link visibility. Introduce a
server-backed or shared cached result that distinguishes:

- no remote publication;
- an upstream that exists remotely;
- a published remote branch with an authoritative browser URL; and
- a stale/deleted upstream.

An upstream config alone is not enough if the remote ref was deleted. The resolver may use `git
ls-remote --heads`, GitHub metadata, or another measured approach, but it must be cached and must not
spawn unbounded per-render processes.

### 9.5 Centralize derived state

Create shared pure helpers for:

- workspace Git presentation state;
- contextual Git action label and availability;
- PR-state presentation; and
- workspace/PR association by canonical URL, number/repository, and source reference.

Reuse them from the Sidebar, hover card, worktree context menu, PR browser, and Environment panel.

### 9.6 Keep oversized Git status from blocking file browsing

Treat the current failure as a high-priority resilience bug. In the reported checkout at
`/Users/amir/Documents/synara-mobile`, `git status --porcelain=2 --branch` produced 1,208,904 bytes
across 4,542 records, exceeding `GitCore`'s 1,000,000-byte capture limit. The output was dominated by
staged files under `.test-state`, but Synara must handle any legitimate high-cardinality repository;
ignoring, deleting, unstaging, or otherwise mutating user files is not an acceptable workaround.

Trace the exact query and error-boundary path that causes opening the file tree to surface
`GitCore.statusDetails.status`. Filesystem browsing through `workspaceEntries.ts` is conceptually
independent from Git status and must remain usable when status is unavailable, oversized, malformed,
or temporarily slow. Split loading/error states where necessary so Git metadata can degrade without
taking down `DockExplorerPane` or `workspaceExplorer`.

Replace all-or-nothing status capture with a bounded, truncation-aware design. The implementation may
stream NUL-delimited porcelain-v2 records or use another measured parser, but it must:

- preserve branch/upstream/ahead-behind data when Git provides it;
- derive a reliable dirty/clean signal without retaining an unbounded file list;
- retain only a documented bounded number of detailed status entries;
- expose explicit `isPartial`/`truncated` metadata through the status contract instead of presenting
  incomplete counts as exact;
- keep rename/copy and paths containing whitespace or newlines parseable;
- avoid immediately respawning the same oversized command through polling, broadcaster, or retry
  behavior; and
- audit downstream `numstat`/diff enrichment for the same unbounded-output assumption.

Merely increasing `DEFAULT_MAX_OUTPUT_BYTES` postpones the failure and is not a complete fix. If the
status is partial, Git surfaces should show concise degraded-state copy such as `Large change set —
showing a partial status`, retain the safe actions supported by known state, and disable any action
that requires missing detail with an explanation. The file tree itself must continue to open and
browse normally.

### Focused verification

- Contracts encode old project/workspace events without new fields.
- A cloned project retains the selected account after restart/hydration.
- GitHub CLI calls use the project account and do not change the globally active account.
- Creating a PR from one conversation updates the workspace and every sibling conversation.
- PR creation receives the workspace target branch.
- Local-only and stale-remote branches return no browser URL.
- Published branches return a valid authoritative URL.
- A generated status response larger than 1 MB returns bounded usable state rather than a command
  failure, with branch and dirty state preserved and partial metadata set.
- Large rename/copy records and unusual paths remain parseable under the bounded representation.
- Opening and browsing the file tree succeeds when the Git status query errors or returns partial
  data; only Git-specific affordances enter a degraded state.
- `GitStatusBroadcaster` and React Query do not hot-loop or spawn overlapping oversized status work.

## 10. Phase 2 — Sidebar ownership, hover states, and context menus

Extract focused components/helpers before expanding `Sidebar.tsx`, for example:

- `WorktreeWorkspaceContextMenu.tsx`
- `ProjectContextMenu.tsx` if extraction is low-risk
- `worktreeWorkspacePresentation.ts`
- shared worktree action handlers/hooks where practical

Exact names may follow repository conventions, but do not add another monolithic inline menu.

### 10.1 Worktree row behavior

- Right-click and the keyboard Context Menu key/Shift+F10 open the worktree menu.
- Double-click and the hover pencil continue to open Rename workspace.
- Row click opens the last active conversation in that workspace.
- Repository-root kind is sorted first and labeled `Repository root`.
- Archived managed workspaces are absent from the normal project list.
- Hover/focus actions remain usable without causing row text to jump.

### 10.2 Worktree context-menu inventory and order

Group actions in this order, omitting unavailable items and using contextual labels:

1. **Open/work**
   - New conversation
   - Show in Finder / Show in File Explorer / Open containing folder
   - Open in editor, when the configured editor integration is available
   - Open terminal at workspace
   - Copy path
2. **Run**
   - Start dev or Stop dev
   - Open dev server when a URL is known
3. **Identity**
   - Rename workspace
   - Pin/Unpin workspace
4. **GitHub**
   - Local only: Publish branch
   - Published with no PR: Create pull request
   - Associated PR: View pull request
   - Actionable review state: Fix review comments or Resolve conflicts when available
   - Copy branch name
   - Open branch on GitHub only when publication is verified
5. **Lifecycle**
   - Archive workspace for managed workspaces
   - External worktrees use Remove from Synara and retain files
   - Repository root has no archive/remove-files action

The menu must prevent the native Cut/Copy text menu from appearing on a worktree row.

### 10.3 Project context-menu inventory

Keep repository-owned actions:

- New workspace
- Show repository in Finder/File Explorer
- Open in Kanban
- Open repository on GitHub when authoritatively resolved
- Copy repository path
- Edit project name/settings
- Pin/Unpin project
- Remove project

Remove routine Start dev, Stop dev, Open dev server, Archive threads, and Delete threads from this
menu once equivalent workspace ownership is complete. Project removal keeps its explicit confirmation
and must not delete external files or remote branches.

### 10.4 Hover-card behavior

- Branch row: plain local branch text when local-only; verified external link after publication.
- Path row: use the formatted path for display and the absolute path for Show in Finder/File Explorer.
- PR row: show number/state when associated, and open the internal PR browser from the primary action.
- Show Local only, Published, Draft PR, PR open, conflicts, closed, or merged in plain language.
- Keep source, workspace state, and conversation count as secondary information.

### 10.5 Rename behavior

Preserve the current dialog behavior:

- visual rename never moves the worktree directory;
- branch rename is opt-in;
- the proposed new branch is previewed;
- published/PR branches cannot be renamed in Synara;
- branch rename updates every workspace conversation projection; and
- failures leave the old name/branch intact and explain what failed.

### Focused verification

- Context menu opens from mouse and keyboard and never falls through to the native text menu.
- Every action receives the selected workspace id/path, never the repository root by accident.
- Local branch hover has no GitHub link and offers folder reveal.
- Published branch hover opens the verified URL.
- Project and worktree menus contain no duplicated ownership actions.
- Rename works visually, optionally renames an unpublished branch, and rejects published rename.

## 11. Phase 3 — Workspace-scoped dev-server actions

Project scripts remain project-owned configuration, but running a script is a workspace action.

### Tasks

1. Extend the dev-server contract with a nullable workspace identity and use a composite target key
   rather than one registry entry per project.
2. Run a worktree action with `cwd = workspace.path` and include `SYNARA_PROJECT_ROOT` plus
   `SYNARA_WORKTREE_PATH` in the environment.
3. Start, stop, reconnect, and remove events must target the exact workspace run.
4. The project row may show an aggregate running indicator, but its context menu no longer owns the
   process action.
5. The selected workspace row shows its own run status and Open dev server when attribution succeeds.
6. Multiple workspace processes may coexist. Port collisions should fail visibly; automatic port
   allocation is not part of this plan unless existing scripts already support it.
7. Archive preflight must detect and stop or require stopping the workspace-owned process.

### Focused verification

- Two workspaces in one project can hold independent tracked process entries.
- Stopping one does not stop the other.
- Exit/reap events remove the correct composite entry.
- Reconnect snapshot restores each workspace’s indicator.
- Commands launch from the selected worktree path.

## 12. Phase 4 — Two-way Pull Request hub

Evolve the existing Pull request source tab into a reusable PR browser rather than creating a second
GitHub surface. It may be rendered inside the workspace creation dialog and opened directly in browse
mode from project/worktree actions.

### 12.1 PR list and filters

- Default to `Review requested`, not `All`.
- Rename `Reviewing` to `Review requested`; the backend already queries
  `review-requested:@me`.
- `My PRs` should mean the selected account’s open authored PRs by default.
- Keep Open, Closed, and Merged as explicit status filters; do not let a generic All default mix
  completed work into the active queue.
- Search title, author, head/base branch, URL, and PR number.
- Rows show title, author, draft/state, head -> base, updated time, and diff stat.
- Mark PRs already linked to a Synara workspace without fetching a snapshot for every row.

### 12.2 Selected PR detail

Fetch the heavier snapshot only for the selected PR. Reuse the existing Environment-panel logic and
presentation for:

- checks rollup;
- unresolved review comments;
- merge conflicts;
- draft/open/closed/merged state; and
- bounded agent Fix prompts.

Avoid an N+1 process/API pattern across the list.

### 12.3 PR -> Synara flow

The selected PR’s primary action is state-dependent:

- **Review in new workspace** when no workspace is associated.
- **Open workspace** when an active workspace already exists.
- **New review conversation** as a secondary action for an existing workspace.
- **Restore workspace** when the associated managed workspace is archived.
- **Open on GitHub** for closed/merged PRs, with local inspection secondary if supported.

Before preparing Git state, match existing workspaces by canonical PR identity using `lastKnownPr` and
`sourceRef`. Do not wait until after checkout to discover a duplicate.

When creating a PR workspace:

- derive the editable workspace display title from the PR title unless the user already edited it;
- use the PR head as the local branch and the actual base as `targetRef`;
- support forks using the existing cross-repository materialization logic;
- attach the PR to the workspace;
- create a conversation titled for the PR; and
- seed an unsent review prompt with PR number/URL, base/head, checks, comments, and the instruction to
  review the committed diff. The user must be able to edit it before sending.

### 12.4 Synara -> PR flow

After a workspace publishes or creates a PR:

- persist the PR on the workspace;
- refresh every sibling conversation and the worktree row;
- change the contextual action from Publish branch -> Create pull request -> View pull request;
- make the primary PR badge/action open the internal PR browser on that PR;
- keep Open on GitHub as a clear secondary action;
- route Fix review comments and Resolve conflicts into a conversation in the associated workspace;
  and
- when merged, show Merged plus Archive workspace.

The post-action toast’s View PR action should open the internal PR browser first. GitHub remains one
click away from that surface.

### 12.5 Consolidate legacy checkout entry points

`PullRequestThreadDialog.tsx` currently offers Local and Worktree checkout into a draft thread. Under
the workspace protocol, route this entry point into the shared PR browser and managed-workspace flow.
Do not keep two independent PR preparation paths that can produce different associations.

Repository-root checkout should not be the default because it changes the main checkout underneath
other project work. If legacy protocol support must remain temporarily, isolate it and cover the mode
gate with tests.

### PR-row context menu

- Open workspace / Restore workspace / Review in new workspace
- New review conversation when associated
- Open on GitHub
- Copy pull request link
- Archive workspace when merged and associated

### Focused verification

- Review requested and My PRs use the selected project account.
- Selecting a PR already in Synara opens it without Git mutation or duplicate worktree creation.
- A new PR workspace is named from the PR and targets its actual base.
- Fork PR creation/reuse remains covered.
- The review composer draft is prepared but not automatically sent.
- A PR created from a normal workspace appears in the PR browser and every sibling conversation.
- Checks/comments/conflicts refresh without per-row snapshot polling.
- Merged PRs offer archive and no native merge button.

## 13. Phase 5 — Archive and restore lifecycle

The schema already names archive/restore states and operation kinds. Complete the state machine rather
than implementing archive as a client-only hide flag.

### 13.1 Commands, events, and reactor

Add generation-checked request/completion transitions for archive and restore, following the existing
provision operation pattern. Exact event names should follow current conventions, but the state flow is:

```text
ready -> archiving -> archived
archived -> provisioning/restoring -> ready
```

Failures retain enough state to retry and must not falsely report the workspace archived/restored.
Restart recovery must enqueue in-flight archive/restore work idempotently.

### 13.2 Archive preflight

Server-authoritative preflight must inspect:

- workspace kind/state and active operation;
- active agent turns/conversations;
- active terminals and workspace dev server;
- working-tree changes, including untracked files;
- unresolved conflicts;
- local commits ahead of the remote/upstream; and
- associated PR/remote state for clear copy.

Safety policy:

- block archive while an agent turn, terminal operation, setup, merge conflict, or dev server is
  actively using the workspace;
- block dirty/untracked worktree removal and tell the user to commit, stash, or discard first;
- allow a clean local-only or ahead branch after explicit confirmation because the local branch ref
  remains, but state clearly that the commits are not on GitHub;
- never use force removal to bypass dirty-work safeguards;
- never delete the branch or remote branch during archive; and
- preserve every conversation and workspace metadata record.

### 13.3 Kind-specific behavior

- **Managed:** remove the clean Git worktree, retain its local branch and metadata, set archivedAt,
  and restore later at the managed path.
- **Repository root:** cannot be archived or removed as a worktree. Keep the row visible.
- **External:** Remove from Synara hides/detaches the record but never deletes the external directory.
  Restore/reattach only if the path still exists and matches the repository.

### 13.4 Restore UX

Add an Archived workspaces entry point at the project level or an equivalent discoverable project
surface. Show workspace title, branch, PR state, archive time, and Restore.

Restore recreates the managed worktree from the retained local branch, reruns only setup work that is
explicitly safe under existing conventions, rebinds conversation CWD projections, and opens the last
active conversation. If the branch/path is missing or occupied, fail with a recoverable explanation.

### Focused verification

- Dirty, conflicted, active-turn, and running-dev workspaces cannot be removed.
- Clean managed workspace archives without deleting its branch, PR, or conversations.
- Local-only/ahead confirmation copy is accurate.
- Restore recreates the path and rebinds all sibling conversations.
- Reactor restart resumes or safely reconciles in-flight operations.
- Repository root cannot be archived.
- External removal retains files.

## 14. Phase 6 — Integrated QA and polish

Run end-to-end scenarios in an isolated Synara home and test repository with at least two configured
GitHub accounts. Do not use the developer’s live repository or active Synara ports for destructive
tests.

### Required scenarios

1. Create a workspace from main. Confirm it is local-only and has no GitHub link.
2. Reveal its path from the hover card and context menu.
3. Rename the display label without changing the branch; then rename an unpublished branch opt-in.
4. Commit selected files, publish, and confirm the branch link only after remote verification.
5. Create a PR and confirm the correct workspace target branch and GitHub account.
6. Open the same PR from the PR browser and confirm the existing workspace is reused.
7. Add a sibling conversation and confirm both show the same PR/check state.
8. Open an incoming fork PR into a workspace and prepare an unsent review prompt.
9. Surface review comments/conflicts and route Fix into the associated workspace.
10. Run independent dev processes in two workspaces and stop only one.
11. Block archive with dirty files, then archive a clean workspace and restore it.
12. Confirm merged PR -> archive flow and retained conversation history.
13. Confirm Repository root has repository-root behavior and no destructive archive.
14. Confirm project/worktree/PR context menus work by mouse and keyboard.
15. Confirm no link generated by Synara leads to a known-nonexistent branch.
16. Generate a repository whose porcelain-v2 status exceeds 1 MB. Confirm the file explorer opens,
    folders and files remain browsable, Git state is clearly marked partial, and polling remains
    bounded without modifying the generated files.

### Accessibility and interaction checks

- Context menus have deterministic focus, Escape dismissal, and keyboard invocation.
- Icon-only actions have accurate accessible names and tooltips.
- Loading, disabled, unavailable, and error states explain why an action cannot run.
- Menu item labels are actions, not ambiguous nouns.
- Hover-only actions remain reachable by keyboard.
- Motion follows shared disclosure helpers and respects reduced motion.

### Performance checks

- No PR snapshot is fetched for every list row.
- No GitHub process is spawned on each React render.
- Visible workspace status polling is deduplicated by workspace CWD/PR identity.
- Closing the PR browser or Environment panel stops its expensive polling.
- Large projects with many archived workspaces do not hydrate every PR snapshot.
- A high-cardinality working tree keeps memory/output retention bounded and does not repeatedly run a
  known-oversized status command on overlapping timers.

## 15. Important files and likely ownership

### Contracts and projections

- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/git.ts`
- `packages/contracts/src/project.ts`
- `packages/contracts/src/ws.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/server/src/orchestration/decider.workspaces.test.ts`
- `apps/server/src/orchestration/Layers/WorktreeWorkspaceReactor.ts`
- `apps/server/src/orchestration/Layers/WorktreeWorkspaceReactor.test.ts`

### Git and GitHub

- `apps/server/src/git/Layers/GitCore.ts`
- `apps/server/src/git/Layers/GitCore.test.ts`
- `apps/server/src/git/Layers/GitStatusBroadcaster.ts`
- `apps/server/src/git/Layers/GitStatusBroadcaster.test.ts`
- `apps/server/src/git/Layers/GitManager.ts`
- `apps/server/src/git/Layers/GitManager.test.ts`
- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitHubCli.test.ts`
- `apps/server/src/git/Services/GitManager.ts`
- `apps/server/src/git/Services/GitHubCli.ts`
- `apps/server/src/git/testing/fakeGitHubCli.ts`
- `apps/server/src/wsRpc.ts`
- `apps/server/src/workspaceEntries.ts`
- `apps/server/src/workspaceEntries.test.ts`
- `apps/server/src/workspaceEntries.chunking.test.ts`
- `apps/web/src/lib/gitReactQuery.ts`

### Sidebar/workspace UI

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.logic.test.ts`
- `apps/web/src/components/WorktreeWorkspaceHoverCardContent.tsx`
- `apps/web/src/components/WorktreeWorkspaceHoverCardContent.test.tsx`
- `apps/web/src/components/WorktreeWorkspaceRenameDialog.tsx`
- `apps/web/src/components/WorktreeWorkspaceRenameDialog.test.ts`
- `apps/web/src/components/WorktreeWorkspaceCreateDialog.tsx`
- `apps/web/src/components/WorktreeWorkspaceCreateDialog.logic.ts`
- `apps/web/src/components/WorktreeWorkspaceCreateDialog.logic.test.ts`
- `apps/web/src/components/WorkspaceView.tsx`
- `apps/web/src/components/chat/DockExplorerPane.tsx`
- `apps/web/src/components/chat/workspaceExplorer.tsx`

### PR surfaces

- `apps/web/src/components/PullRequestThreadDialog.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/GitActionsControl.logic.ts`
- `apps/web/src/components/GitActionsControl.logic.test.ts`
- `apps/web/src/components/chat/environment/EnvironmentPullRequestSection.tsx`
- `apps/web/src/components/chat/environment/environmentPullRequest.logic.ts`
- `apps/web/src/components/chat/environment/environmentPullRequest.logic.test.ts`
- `apps/web/src/pullRequestReference.ts`

### Dev-server ownership

- `apps/server/src/devServerManager.ts`
- `apps/server/src/devServerManager.test.ts`
- `apps/web/src/projectRunStore.ts`
- `apps/web/src/projectRunTargets.ts`
- `apps/web/src/projectScripts.ts`

Fable should refine this ownership list after the drift audit. It is not permission to edit every file.

## 16. Verification strategy

Each work package runs its narrowest focused tests before integration. Phase gates then run the union
of affected suites. At the end, because the new-conversation instruction explicitly requests complete
implementation verification, run one bundled final pass:

```bash
bun fmt && bun lint && bun typecheck && bun run test
```

Never run `bun test`.

Also run targeted browser/component tests for the context menus, hover card, create/PR browser, and
Environment Fix flows if they are not included in the default test command. The final report must list
the exact commands and results; “tests pass” without commands is insufficient.

Do not push, publish a branch, or open a real PR without the user’s explicit authorization. Local
integration commits are allowed if Fable needs them to coordinate isolated worktrees, but they must be
reported and must not absorb unrelated user changes.

## 17. Decision and STOP conditions

Fable may decide internal names, component boundaries, and test factoring without asking. Stop and ask
the user when:

- preserving the existing dirty work requires a checkpoint/stash/integration choice;
- a proposed change alters any settled product decision in Section 5;
- archive safety would permit possible loss of dirty or unreachable commits;
- account selection cannot be made project-specific without changing the visible account workflow;
- the implementation would delete or rename a remote branch;
- a workspace/PR can no longer be mapped one-to-one without a product rule for duplicates;
- native merge/review submission appears necessary to complete a flow;
- a repository-root or external-worktree action could delete user-owned files;
- oversized-status handling would silently ignore/mutate files, report an uncertain repository as
  clean, or require unbounded memory/process output;
- the plan materially expands into port management, full PR diffs, rebase automation, mobile, or
  Kanban; or
- live code has drifted enough that cited architecture and tests no longer apply.

When escalating, provide the observed evidence, two or three viable options, consequences, and one
recommendation. Continue any independent safe work while waiting.

## 18. Definition of done

- [ ] Initial Opus/Terra/Sonnet/Sol review is synthesized and reported.
- [ ] Existing dirty work is preserved and the integration base is explicit.
- [ ] Project GitHub account persists and scopes every GitHub-backed workflow.
- [ ] Workspace/PR association is durable and shared by sibling conversations.
- [ ] PR creation uses the workspace target branch.
- [ ] Local-only branches never render speculative GitHub links.
- [ ] Published branch URLs are verified and valid.
- [ ] Repositories with Git status output above 1 MB return bounded, explicitly partial Git state
      without reporting uncertain state as clean.
- [ ] File browsing remains usable when Git status fails, is slow, or is partial.
- [ ] Status polling/broadcasting does not hot-loop on oversized repositories.
- [ ] Worktree hover path opens Finder/File Explorer.
- [ ] Worktree context menu and revised project menu match ownership rules.
- [ ] Repository root is explicit and protected.
- [ ] Workspace rename and optional local branch rename remain safe.
- [ ] Dev-server actions run against and track the selected workspace.
- [ ] PR browser supports PR -> workspace and workspace -> PR without duplicates.
- [ ] Checks/comments/conflicts can be routed into the associated workspace.
- [ ] Managed workspaces archive/restore safely while retaining conversations and branches.
- [ ] External and repository-root lifecycle behavior cannot delete user files.
- [ ] Focused and final verification pass.
- [ ] Final Opus or Terra independent review has no unresolved high-severity findings.
- [ ] User receives a final 100% report with changes, verification, known limitations, and any
      intentionally deferred work.

## 19. Prompt to start the new Fable conversation

Use this document as the source of truth and give Fable this instruction:

```text
Review and implement docs/plans/synara-worktree-github-workflow-implementation.md end to end.

You are the parent orchestrator and project manager. Use Codex Sol at medium/high, Codex Terra at
high/xhigh, Sonnet at high/xhigh, and Opus at high or x-high according to task difficulty and the
routing rules in the plan. Keep me informed throughout with precise status, weighted completion
percentage, current work, issues, verification, and decisions that need my feedback. Re-analyze
material decisions with me rather than silently changing settled behavior. Preserve the current dirty
worktree, follow AGENTS.md and CLAUDE.md, and do not push or open a PR without my explicit approval.
```

# Gitea feature parity plan for Electron

## Goal

Give a person using the Electron app the same useful issue and pull request workflows for a connected Gitea repository that they have for GitHub. Match behavior, not the GitHub sign-in mechanism or GitHub's API shapes. A Gitea personal access token remains tied to its saved instance, and Git pushes continue to use the person's Git credentials.

This plan describes the feature gap and validation as of September 25, 2026. The existing [Gitea integration plan](gitea-integration-plan.md) records the MVP and its earlier validation. The parity branch descends from the accepted `v2.0.1-internetisalie-trunk` at `89c5a3385`; four Gitea commits were transplanted onto it. The rejected `b5d65b17f` trunk is not an ancestor of this branch.

## Current comparison

| Workflow in Electron | GitHub | Gitea now | Work left |
|---|---|---|---|
| Connect and identify an account | Device flow, saved accounts, account switching, optional `gh` CLI | PAT, one account per instance, multiple instances | Keep PAT setup; decide whether more than one account per instance is needed for functional parity |
| Find issues and PRs for a project | Search, paging, direct number, upstream repository discovery | Search, paging, direct number, nested-folder choice, and connected-remote choice | Validate in Electron against a private repository and same-name repositories on different instances |
| Start or enrich a chat | Attach an issue or PR; send PR comments and failed checks to chat | Attach an issue or PR, optionally with its diff; pin individual issue/review comments and failed checks | Live comment attachment confirmed in Electron |
| Create a PR | Shared creation form, including a fork source | Same form, including a fork source | Keep this behavior working through the port |
| Read a PR | Overview, checks, review and issue comments | Overview, issue comments, separately loaded review comments and commit checks with independent errors and refresh | Live empty review/check results confirmed in Electron; populated review/check examples remain fixture-tested |
| Track a branch's PR | Refreshing status in the Git view and session sidebar, including historical PRs | Shared status in the Git view and sidebar, including recent closed PRs | Validate in Electron against a connected instance during the acceptance pass |
| Manage a PR | Edit title/body, mark ready, choose merge method, merge | Edit, mark ready, and guarded merge with the repository's allowed methods | Edit and ready confirmed in Electron; the test PR's merge is blocked by required approvals |
| Walk through a PR | User-initiated walkthrough of the committed PR diff, with file context | Gitea source, published diff, merge-base/head context, Changes selector, user-initiated generation | Live Electron walkthrough and file-context read confirmed |

Gitea can already post issue-style comments from OpenChamber. The current GitHub runtime API does not expose that write operation, so it is an additional Gitea capability rather than a parity gap.

## Sequence

The branch-status portion of step 1 is implemented on the Gitea branch: the Git view and sidebar share instance- and remote-qualified status, recent closed PRs can be shown, and a failed refresh retains the last confirmed result. Step 2 now has repository-scoped issue/PR search, paging, direct-number lookup, connected-remote choice, and the Git panel's nested-folder selection in the attachment picker. Walkthrough and generation identity belongs to step 5, when Gitea PRs become walkthrough sources.

The nested-folder choice uses the shared Git discovery route. The accepted fork base already contains the breadth-first discovery fix from `fix/v2-git-repo-discovery-bfs`, so a large early subtree cannot hide Loom's sibling repositories under the scan limit. The Gitea transplant does not duplicate that route change.

On September 25, the isolated Electron build loaded the new picker for the connected `ad-demo` repository and returned its open PRs when searching for `OpenChamber`. Automated UI coverage switches between two same-name repositories on different instances and rejects a stale result from the first. A live second-instance acceptance check remains for step 6.

The September 25 parity pass used Gitea 1.27.3 and an isolated Electron profile. PR #21 in `ad-demo` confirmed separately loaded empty reviews and checks, single-comment chat attachment, editing, the `WIP:` ready transition, published-diff Changes mode, merge-base file context, and user-initiated walkthrough generation. The merge request reached Gitea, which rejected it because this repository requires additional approvals; OpenChamber leaves the PR open and now reports that policy reason. Server tests cover a read-only account and a changed remote, but a separate read-only PAT and a second live instance were not available for a live acceptance run. The isolated Electron app, its data, and build scratch space live under the user's home directory; the systemd `openchamber` and `openchamber-dev` services were not changed.

### 1. Lock down repository and status identity

Introduce provider-aware identities for branch status and PR detail: provider, normalized instance URL, owner, repository, selected Git remote, and PR number when known. Use them in status entries, request results, and detail keys. Carry the same identity into walkthrough sources, caches, and generation jobs in step 5. Preserve existing GitHub keys and saved walkthroughs. A directory and branch alone do not identify a Gitea PR, and two instances may have the same owner, repository, and number.

Add Gitea branch status to the session sidebar and make the Git panel refresh on relevant Git changes. Show the last confirmed status with an error when refresh fails. Treat a merged or closed PR as branch history, then allow a newer open PR to replace it. Scope comment drafts and detail responses to the same identity.

Done when two instances with the same repository and PR number stay separate in the Git view, sidebar, and caches; switching projects, remotes, or branches never shows another PR's data; refresh failures do not become "no PR."

### 2. Bring issue and PR discovery up to the GitHub workflow

Add search and paging for issues and PRs. Check the supported Gitea API before choosing a search method. If PR search needs bounded pagination, tell the person when results may be incomplete. The picker should let the person choose among relevant configured remotes, including a fork and its upstream, and show the repository and instance on each result. Keep direct-number lookup. A failed or unauthorized search remains an error, not an empty list.

Done when search, paging, remote selection, direct number, and attachment work in Electron for a private repository and for same-name repositories on different Gitea instances.

### 3. Fill in PR detail and chat context

Extend the normalized Gitea detail response with review comments and checks where supported by the connected Gitea version. Reuse the GitHub presentation only where the data has the same meaning. Keep issue comments and inline review comments distinct. Report missing API data as unavailable; do not display "no checks" unless Gitea confirmed that result. Let a person attach a single comment or a failed check to chat, as the GitHub panel does.

Start by recording the Gitea versions and API responses supported by the feature. Fetch large or expensive sections only when opened, and refresh checks while they are running. Keep partial sections visible when one request fails.

Done when the ad-demo PR shows confirmed checks and conversation where present; failed sections show a retry without hiding the PR overview; chat attachments retain the correct instance and repository after reload.

### 4. Add supported PR actions

Add editing title/body, marking a draft ready, and merging with the methods allowed by the repository. Check the connected server's capabilities and repository settings before showing an action. Gitea's `WIP:` draft convention in the current create flow needs a tested transition to ready; do not assume GitHub's draft endpoint or state model applies.

Resolve the target and source remotes again on the server immediately before every write. Reject an identity change, a missing write permission, or an unsupported action without changing local status. After success, refresh the PR and show the server-confirmed result. Preserve the typed edit on failure.

Done when each action succeeds on a disposable PR in the supported test instance; a read-only token, changed remote, unsupported method, and server failure each leave the UI and remote state consistent.

### 5. Add Gitea PR walkthroughs

Extend the walkthrough source contract, server parser, diff loader, file-context loader, and Changes selector for a Gitea PR. Resolve the saved instance from the selected project and remote on every request. Fetch the committed PR diff and base/head file content from that instance. Include provider and instance in source, cache, and job keys. Keep generation user-initiated.

Done when a Gitea PR walkthrough uses its published diff, can expand file context, and never reuses a GitHub or other-instance walkthrough for the same PR number. Existing GitHub and local-change walkthrough keys continue to work.

### 6. Electron acceptance pass

Run focused server contract tests, UI behavior tests, package type checks, and lint for each step. Before calling the work parity-complete, test the full flow in an isolated Electron build against a disposable Gitea repository: connect, search, attach, create, read details, comment, edit, mark ready, merge, inspect sidebar status, and generate a walkthrough. Test with a read-only token too. Keep the running `openchamber` and `openchamber-dev` services separate from this test.

The Gitea commits are on the accepted v2 port. The final branch passed focused Gitea and walkthrough server tests, isolated UI tests, UI and web type checks, lint, and the web/Electron asset builds. The isolated Electron app runs this branch with the bundled OpenCode 2.0.16 server. It loaded `ad-demo` PR #21 in the PR panel and Changes selector, including its title, body, issue comment, confirmed empty review/check sections, and published file diff. Gitea 1.27.3 is the live tested server version. The repository's approval rule prevents a successful merge of the disposable PR, so the live merge-success path remains unverified; the app reports the rule and leaves the PR open. A separate read-only PAT and a second Gitea instance were unavailable for live testing, though the relevant identity and permission cases have server/UI tests. The systemd `openchamber` and `openchamber-dev` services were not changed.

## Implementation decisions

- Gitea 1.27.3 is acceptance tested. The APIs used are documented for 1.24, but older instances are not claimed as tested.
- One account per instance remains the supported credential model; multiple instances are supported. Account switching within one instance is outside Electron workflow parity.
- Gitea actions use the shared Git panel area and a provider-specific detail component because review and check payloads differ from GitHub.
- Merge uses a second confirmation click. Repository approval rules are respected; the UI does not offer force merge.

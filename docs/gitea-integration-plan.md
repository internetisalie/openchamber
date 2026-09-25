# Gitea integration plan

## Implementation status

The internetisalie fork and Gitea MVP are ported onto upstream OpenChamber `v2.0.1` in a separate worktree. Milestones 1 and 2 cover connection management, Git remote matching, and issue/PR context from the chat attachment menu. Selecting an item in a new session draft adds it to the first message. A local Gitea 1.24 instance verified token connection, private issue and PR reads, comments, diff retrieval, and pagination on the earlier release. The v2 port has server contract tests; it still needs an isolated live Electron check.

The Git pull request view discovers an open Gitea PR for the current branch and creates one using the shared GitHub creation form, including a fork source remote, description generation, and Gitea's WIP draft convention. The create route has contract tests and created a documentation-only draft PR in `internetisalie/ad-demo` ([#20](https://gitea.internetisalie.net/internetisalie/ad-demo/pulls/20)) on the earlier release. The v2 panel loads its description, status, branches, and issue-style comments. The picker opens issue and PR detail before attachment. Both views can post a comment through the connected instance.

An isolated OpenCode 2.0.16 and Electron build of this worktree showed PR #20's detail, posted a test comment, refreshed it, and attached the PR to a chat draft. The shared Electron form created a second documentation-only draft PR, [#21](https://gitea.internetisalie.net/internetisalie/ad-demo/pulls/21), from a fresh pushed branch. The existing `openchamber-dev` and `opencode-dev` services were not changed.

## Goal

Add Gitea to Settings → Integrations as a first-party OpenChamber connection. A user should be able to connect a self-hosted Gitea instance, open a project whose Git remote points to that instance, use its issues and pull requests as session context, and create a PR from the Git view. The next work brings useful PR detail and conversations into that view.

This is an OpenChamber server feature. `runtimeFetch` carries UI requests to that server; it does not give the OpenCode agent direct access to Gitea. The agent receives issue or PR content when the user starts a session from it or attaches it to a message.

## Scope and sequence

### 1. Connection and repository identity

Add a Gitea card to `packages/ui/src/components/sections/integrations/IntegrationsPage.tsx`. Its form takes an instance URL and a personal access token. Show the connected account and instance, a clear error when verification fails, and a disconnect action. Add the card to settings search and translations.

Add an optional `RuntimeAPIs.gitea` contract in `packages/ui/src/lib/api/types.ts`, a web wrapper in `packages/web/src/api/gitea.ts`, and `/api/gitea/*` routes in a focused `packages/web/server/lib/gitea/` module. Register the routes with the other first-party integrations. The server verifies a new token with `GET /api/v1/user` before saving it. Responses to the UI never contain the token.

Keep credentials in an OpenChamber server file under `OPENCHAMBER_DATA_DIR`, written atomically with mode `0600`. Do not put the token in OpenCode config, browser storage, the settings registry, logs, or a URL. Support more than one instance by keying connections by normalized instance URL; allow one active account per instance initially. Disconnect removes only the selected instance's credential.

Resolve a project's repository from its Git remotes. Parse HTTPS and common SSH forms, including an instance hosted under a URL path. Match the remote to a configured instance before making an API call. Do not identify a repo using `github.com` assumptions or only its `owner/repo` name; instance identity is part of every repo, PR, and cache key.

Acceptance checks:

- Valid token connects and displays the account and instance; invalid token or unreachable instance leaves the prior connection intact.
- Two instances with the same `owner/repo` remain distinct. A remote for an unconfigured host reports that it has no matching Gitea connection.
- HTTPS, scp-style SSH, and `ssh://` remotes resolve; malformed remotes fail clearly.
- Web, desktop, and paired mobile use the same server connection. VS Code hides Gitea until its runtime supplies the contract.

### 2. Read and attach issues and pull requests

Add server operations for repository issue and PR lists, one issue or PR, comments, and a PR diff. Use Gitea's `/api/v1/repos/{owner}/{repo}/issues` and `/pulls` APIs. Keep pagination and errors explicit: a failed request must not look like an empty repository. Normalize Gitea responses at the server boundary so the UI does not depend on raw API fields.

Add Gitea pickers for starting a session and attaching an issue or PR to a message. Add Gitea-specific context kinds to `contextParts.ts` and the message rendering paths that currently recognize `github-issue`, `github-pr`, and `linear-issue`. Store the instance, repository, item number, title, and canonical URL in context metadata. Reuse shared picker presentation where it fits, while keeping provider identity explicit.

This is the first useful release. A person can connect Gitea, browse a matching project's issues and PRs, and bring one into a conversation. PR creation and automatic branch tracking are outside this release.

Acceptance checks:

- Private issues and PRs can be read with the connected account. List paging, empty results, and API failures appear as different states.
- Starting a session from an issue or PR includes its content; attaching one to a message preserves a working link after reload.
- The same issue number on two instances or repositories never loads the wrong item.
- Missing access, a deleted item, and an expired or revoked token produce actionable errors without erasing another connection.

### 3. Branch status and PR actions

Git view now discovers open Gitea PRs for a local branch, including forks and multiple remotes, and can create a PR. It resolves both remotes on the server before making a Gitea request. Complete the UI create flow against the test repository, then expose status in the session sidebar. Keep any shared PR cache separate from GitHub's `directory::branch` state or include provider and instance in the key. Add edit, mark ready, and merge only after checking which Gitea versions and repository settings support each action. Require write-capable token scopes for those operations; read-only connections continue to work for milestone 2.

Validate PR refresh after local Git changes and after each action. Preserve the last known PR status on transient failures instead of replacing it with "no PR."

### 4. PR detail and conversations

Start with a read-only PR overview in the existing Git pull request panel. Show the title, author, open/draft/closed/merged state, source and target branches, description, and conversation comments. The server already reads the PR body and issue-style comments; extend its normalized PR detail response only for fields the UI needs. Reuse provider-neutral parts of the GitHub presentation where they fit. Do not display empty reviewers, checks, or activity sections as if Gitea had confirmed there were none. Add those sections later, after mapping their Gitea APIs and missing-data behavior.

Add an issue detail view from the Gitea picker so a person can read an issue before attaching it. Put a comment form there and in the PR conversation panel. Gitea uses [`POST /repos/{owner}/{repo}/issues/{index}/comments`](https://docs.gitea.com/api/1.24/operations/issue-create-comment/) for an issue comment. The server must resolve the repository from the project directory and selected remote, validate the item number and nonempty body, and post only to the saved instance. Require a token with [`write:issue`](https://docs.gitea.com/development/oauth2-provider/) for posting; keep reading available to tokens with `read:issue`. Refresh the conversation after success, and keep the typed comment and show the error if posting fails. Inline diff review comments are separate work.

Acceptance checks:

- Opening `ad-demo` PR #20 in Electron shows its description, author, branch pair, state, and any conversation comments. A missing optional field reads as unavailable rather than an invented value.
- A failed detail or comment request leaves the last confirmed PR visible with an error and a retry action. Switching project, branch, remote, or Gitea instance cannot show another PR's detail or comment draft.
- A write-capable token can post an issue comment and see it after refresh. A read-only or revoked token gets a clear error, and a failed post leaves no phantom comment.
- A live UI check creates a disposable PR through the Electron form; the existing route test alone does not cover that path.

### 5. Walkthroughs for Gitea PRs

Extend walkthrough source identity with provider and instance. Fetch the committed PR diff from Gitea's `GET /api/v1/repos/{owner}/{repo}/pulls/{index}.diff` endpoint. Include provider, instance, repository, and PR number in cache and job keys so a Gitea PR cannot reuse a GitHub review. Keep walkthrough generation user-initiated.

## URL and credential rules

The instance URL is user supplied and may intentionally point to a private host. Accept that use case, but validate scheme, hostname, port, path, and credentials in the URL. Prefer HTTPS; if HTTP is allowed, make that choice explicit in the connection form. Build API paths from the saved instance URL, not from API response links or user-provided `diff_url` values. Never send the token to a different origin through a redirect. Bound request time and response size, and avoid logging request headers or token-bearing errors.

For an instance installed below a path, retain the base path when building `/api/v1` URLs. Treat a mismatch between a Git remote's host or path and the saved instance as unresolved rather than guessing.

## Validation

Use a local Gitea fixture or test instance for contract tests against token verification, lists, detail, pagination, comments, and diff responses. Unit test URL normalization and remote parsing with HTTPS, SSH, ports, path prefixes, and ambiguous same-name repositories. Exercise connection storage with failed writes and malformed files. Test UI behavior for disconnected, loading, empty, error, and connected states. Run the repository's focused web and UI checks for each milestone, plus cross-runtime checks when `RuntimeAPIs` changes.

## Next step

Finish the repository checks and commit the v2 port. The issue picker and comment endpoint share the same detail and comment components tested with PR #20; a separate live issue comment remains useful when a disposable issue is available. Keep the running 1.24.3 dev installation available until the v2 port is deliberately installed. Review milestone 5 walkthrough work separately.

## Open decisions

- Minimum supported Gitea version for edit, mark ready, and merge. The current create flow uses Gitea 1.24's `WIP:` draft convention.
- Git push still uses the user's existing Git credentials. The integration token authenticates API calls, not Git pushes.
- Whether to add OAuth after the token flow works. OAuth would require registration and callback handling for each self-hosted instance.

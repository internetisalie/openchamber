# Gitea integration plan

## Implementation status

The MVP (milestones 1 and 2) is implemented in this worktree. It covers connection management, Git remote matching, and read-only issue/PR context from the chat attachment menu. Selecting an item in a new session draft adds it to the first message. A local Gitea 1.24 instance verified token connection, private issue and PR reads, comments, diff retrieval, and pagination. PR actions, branch status, and walkthroughs remain the next milestones.

## Goal

Add Gitea to Settings → Integrations as a first-party OpenChamber connection. A user should be able to connect a self-hosted Gitea instance, open a project whose Git remote points to that instance, and use its issues and pull requests as session context. Later work can add PR creation, status, and walkthroughs.

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

Add Gitea PR discovery for a local branch, including forks and multiple remotes, then expose status in Git view and the session sidebar. Keep its cache separate from GitHub's `directory::branch` state or include provider and instance in the key. Add create, edit, mark ready, and merge only after checking which Gitea versions and repository settings support each action. Require write-capable token scopes for these operations; read-only connections continue to work for milestone 2.

Validate PR refresh after local Git changes and after each action. Preserve the last known PR status on transient failures instead of replacing it with "no PR."

### 4. Walkthroughs for Gitea PRs

Extend walkthrough source identity with provider and instance. Fetch the committed PR diff from Gitea's `GET /api/v1/repos/{owner}/{repo}/pulls/{index}.diff` endpoint. Include provider, instance, repository, and PR number in cache and job keys so a Gitea PR cannot reuse a GitHub review. Keep walkthrough generation user-initiated.

## URL and credential rules

The instance URL is user supplied and may intentionally point to a private host. Accept that use case, but validate scheme, hostname, port, path, and credentials in the URL. Prefer HTTPS; if HTTP is allowed, make that choice explicit in the connection form. Build API paths from the saved instance URL, not from API response links or user-provided `diff_url` values. Never send the token to a different origin through a redirect. Bound request time and response size, and avoid logging request headers or token-bearing errors.

For an instance installed below a path, retain the base path when building `/api/v1` URLs. Treat a mismatch between a Git remote's host or path and the saved instance as unresolved rather than guessing.

## Validation

Use a local Gitea fixture or test instance for contract tests against token verification, lists, detail, pagination, comments, and diff responses. Unit test URL normalization and remote parsing with HTTPS, SSH, ports, path prefixes, and ambiguous same-name repositories. Exercise connection storage with failed writes and malformed files. Test UI behavior for disconnected, loading, empty, error, and connected states. Run the repository's focused web and UI checks for each milestone, plus cross-runtime checks when `RuntimeAPIs` changes.

## Decisions to settle before milestone 3

- Minimum supported Gitea version, especially for draft and merge behavior.
- Whether Git push credentials remain entirely with the user's existing Git setup. The proposed integration token authenticates API calls only.
- Whether to add OAuth after the token flow works. OAuth would require registration and callback handling for each self-hosted instance.

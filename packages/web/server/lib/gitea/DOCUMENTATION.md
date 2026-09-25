# Gitea integration

This module owns OpenChamber's first-party Gitea connection and read-only issue/PR access. `feature-routes-runtime.js` registers `routes.js`; the web API wrapper reaches these routes through `runtimeFetch`. Web, desktop, hosted, and paired mobile therefore use the same server-side credentials. The VS Code runtime does not expose `RuntimeAPIs.gitea` yet.

`storage.js` keeps one token per normalized instance URL in `OPENCHAMBER_DATA_DIR/gitea-auth.json` (or `~/.config/openchamber/gitea-auth.json`). New tokens are verified against `/api/v1/user` before replacing an existing connection. Writes use an atomic rename and mode `0600`. Route responses contain only the instance URL and account login.

`repo.js` resolves the active directory from Git fetch remotes, trying `origin` first. It matches host, configured URL path, and HTTP(S) port before using a saved token. SSH remotes match host and path; if more than one saved instance could match, resolution fails. A missing match returns 404 instead of guessing from an `owner/repo` string.

`client.js` builds API paths from the saved instance URL, sends the token only to that origin, disables redirect following, limits a request to 10 seconds, and rejects responses above 4 MB. The routes normalize items and construct their browser links from the matched instance. List failures remain errors, rather than appearing as an empty list. List and comment pagination use Gitea's `Link` header when available, even when a page is shorter than the requested limit; older servers without that header use the requested page size. Link URLs are never followed. Detail requests read up to 100 comments across at most 10 pages and mark partial comment content. PR diffs are fetched only when the picker asks for one.

The composer stores Gitea issue and PR context with the instance URL, owner, repository, number, and canonical URL in `gitea-issue` / `gitea-pr` metadata. It uses the existing linked reference snapshot for the session row. This first release reads and attaches context; it does not create or update Gitea PRs.

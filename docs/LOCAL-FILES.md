# File opening

The preview header has one **打开** menu. **浏览器打开** opens the authorized original file in a new tab. PDF uses the browser PDF viewer directly; images and text use native browser rendering. HTML is delivered inline with a restrictive sandbox CSP. Word and unsupported formats use the existing full-page preview instead of downloading or executing content. Unsupported previews retain the existing download action.

Compatible HTTP additions:

- Artifact JSON responses add `open: {browser, native}`. Existing preview fields remain unchanged. `browser` indicates original-byte browser rendering support; `native` also requires a local client, an installed handler and a supported document/media extension.
- `GET /codex-api/v1/artifacts/:scope/:thread?path=...&open=1` streams original bytes inline, with Range support and the same private-directory and citation authorization as previews. Unsupported types return 415. Existing raw previews and downloads are unchanged.
- `POST /codex-api/v1/artifacts/:scope/:thread/open` accepts `{path}` and returns `{url, expiresIn: 60}`. The URL is an opaque `codex-local-file://open/<ticket>` capability. This endpoint requires a local authenticated client and CSRF.
- `POST /codex-api/v1/artifacts/local-open/consume` accepts `{token}` and returns `{path, action: "open"}` to the local helper. It requires local authentication and CSRF, consumes the ticket once, rechecks current file authorization and rejects changed files. Expired/replayed tickets return 410; changed files return 409; remote access returns 403. No existing caller needs migration. There are no new SSE events or generic RPC methods.

The helper runs in the browser user's Windows desktop session, including when the server runs in a background session. It obtains the existing loopback authentication, consumes the capability and uses Windows ShellExecute for supported documents/media. It accepts no paths or commands from the external protocol URL. Script and executable extensions cannot be launched through this feature. It does not execute server tasks or message commands.

Install once from this checkout using a PowerShell terminal, with the actual local listener and private data directory:

```powershell
./scripts/install-local-file-open.ps1 -BaseUrl http://127.0.0.1:3290/ -DataDirectory ./private-data
./scripts/install-local-file-open.ps1 -BaseUrl http://127.0.0.1:3290/ -DataDirectory ./private-data -Check
```

The installer registers only the current user's `codex-local-file` URL scheme and creates `local-file-open.json` in private data. It backs up an existing registration and marker, refuses to replace a different handler, and does not restart browsers or services or change default application associations. Retain this checkout path, or reinstall explicitly after moving it. The browser may show its standard external-application confirmation on first use.

`windows-file-open.ps1 -BaseUrl ... -Uri ... -PlanOnly` executes the authentication and one-time consumption flow and prints the resolved ShellExecute plan without launching a desktop app. Automated tests use only disposable files and isolated service instances.

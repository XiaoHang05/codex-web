# Desktop app tools transport

The optional desktop adapter can enable `discoverAppTools: true`. On Windows,
when the legacy `codex-ipc` pipe is absent and exactly one current-user
`codex-app-tools-<uuid>` pipe exists, it uses the app tools transport. An explicit
`pipe` setting or a live injected legacy connection takes precedence. An
ambiguous discovery fails closed; it does not choose a desktop arbitrarily.

The native source context is the selected, locally indexed desktop thread on
host `local`. The transport does not create or resume a separate engine, inject
code, or take over a thread. Reads use native metadata and the existing local
history reader. Only manually opened chats are polled; polling leases expire
after 90 seconds without a website read. No new notification observer is added.

This transport has a fixed private allowlist containing only `read_thread` and
`send_message_to_thread`. There is no public tool-name parameter, generic RPC
route, automatic message dispatch, or exposed tool discovery API. Native
mutations are limited to an authenticated human's explicit text send. Stop,
steering, approvals, questions, settings, message edits, attachments, new desktop
threads and shared queues are unavailable through this transport. Existing
desktop and browser queues remain stored and are not imported or dispatched.

## Compatible API extensions

`GET /codex-api/v1/capabilities` and `/status` include
`desktop.capabilities` for this transport. The follow snapshot also includes
`desktopCapabilities`. The transport identifier is `app-tools-v1`; booleans
describe `read`, `send`, `steer`, `interrupt`, `approvals`, `queue`, `settings`,
`edit`, and `attachments`. Other adapters retain their previous response shape.
Old clients may ignore the new fields; unavailable native operations return
409. Clients should honor capabilities and disable the corresponding controls.

`POST /codex-api/v1/desktop/:thread/send` retains `input`, requiring a nonempty
array of text items, and requires a `requestId` for this transport. Text sends
are accepted only when a fresh native read confirms that the thread is idle.
The request inherits the desktop's existing model and permissions. It does not
apply web defaults. Current account ownership and read-only guards remain
enforced. Unknown creator identity is readable but cannot send.

Duplicate request IDs within the shared adapter lifetime return the original
result, including ambiguous failures. They cannot send again or be reused with
different text or account identity. Failed read/busy preflight is retryable;
once native send begins there is no automatic retry. Receipts survive immutable
release switches via the injected desktop holder. They are bounded in memory
and do not survive a complete host process restart. A client must not
automatically replay a pending send after a browser or host restart.

HTTP authentication, CSRF, SSE event names, and embedding contract v1 are
unchanged. Legacy transport behavior and request shapes are unchanged. Both
browser and embedded app consume the same capability-aware web client.

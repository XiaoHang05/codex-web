# Desktop stdio relay

The relay keeps the desktop app connected to one native app-server process.
Desktop JSONL input/output remains the original transport. A private named pipe
provides a fixed set of business operations to the authenticated web host.
There is no arbitrary method/tool parameter or public native RPC endpoint.

## Supported operations

The `stdio-relay-v1` transport supports native history and current state, text
and image/skill inputs, steering, interruption, model/reasoning and permission
settings, context compaction, and pending command/file/permission/question/MCP
responses. Queue items can be added, updated, deleted, reordered, or explicitly
started. The idle composer sends directly. Busy submissions are saved to the
native queue. The website does not automatically start queued items: the app
may execute them, or the user can select Send beside a queued item.

Queue items use the app's current execution settings. Native input variants
that the web queue editor cannot represent remain intact and cannot be edited
through that editor. Native attachment association is not an image upload API.
Historical user-message rewriting, queue retry/queue-to-steer conversion, and
desktop conversation creation/archive management remain unavailable in this
transport and must be performed in the app. Capability fields and disabled
controls distinguish these cases.

Writes require the thread already to be loaded by this same engine. The relay
never resumes an unloaded thread or starts another engine to claim it. Account
ownership and protected-chat checks remain enforced by the web adapter.

## Request ownership

Native approval requests retain their original ID and connection. A pending
request is associated with its original thread and request kind. The first
valid response from the desktop or web wins; a late duplicate is not sent to
the native process again. Requested permission subsets and elicitation answers
are validated. Policy amendments remain in the app UI.

Web-originated native RPC IDs use a separate namespace. Their results are not
written into the desktop's stdout. Desktop requests, results, and notifications
remain on the desktop stream. Send/steer/queue-add request IDs retain successful
and ambiguous outcomes for this relay lifetime and are never automatically
replayed. A process restart does not imply resend authorization.

## Discovery and lifecycle

`discoverRelay: true` enables discovery of `desktop-relay.json` in the explicit
native home. Its private token, pipe, relay/native PIDs, and home must validate.
The gateway uses a random Windows pipe name and a constant-time token check.
The descriptor and exclusive home lock belong to that relay instance; normal
exit removes only its own files. A stale crash lock is not deleted blindly.
Inspect its owner before repairing it. The token must never be logged or placed
in a browser response or public download.

The relay CLI forwards ordinary native CLI calls, including version/help/schema
commands and the one-shot `--print-startup-config` policy probe, to the
configured original binary. The policy probe must retain its standalone JSON
output and must not claim or inspect a main relay's home lock. It wraps only a main app-server
invocation. A second main invocation for an active relay home fails closed.
The native child never inherits the wrapper override recursively.

The Windows console shim passes argv and standard streams without a UTF-8 BOM.
`scripts/build-desktop-relay.ps1 -OutputDirectory <absolute-runtime-directory>`
builds it outside the immutable release. The startup script requires explicit
desktop/native/Node executables, native home, and runtime directory. `-Check`
validates and builds without launching or stopping the desktop. Normal startup
refuses an already-running desktop executable. It changes only the new child
process's environment, keeping the original native home and account data.

## Activation boundary

A relay cannot be inserted into a stdio connection that is already running.
Prepare and validate the release first. Activate only during an authorized
desktop launch after existing work is safe to close. Do not terminate the web
host, its injected engine, DSH, Caddy, or an active management chat to activate
this adapter. An installation/update/rollback does not restart desktop work.
The host may refresh its embedded adapter when the private descriptor changes;
the web host itself does not need a restart.

## HTTP compatibility

Existing HTTP paths, authentication, CSRF, SSE names, and embedding contract v1
are preserved. Capabilities identify `stdio-relay-v1`; queue capabilities also
include `queueAutomatic`, `queueRetry`, and `queueSteer`. The queue PUT body gains
`{action:"start",id}` for a user's explicit start. Native send/steer use a unique
request ID for duplicate/ambiguous-outcome protection. Existing adapters retain
their request behavior. A client must honor the capabilities of its selected
transport instead of assuming every enabled desktop adapter has every action.

Skills, MCP status, account details, rate limits and usage are read through fixed
operations on the same native connection. Account reads do not refresh tokens.
The status endpoint checks the relay handshake directly, so it does not require
opening a chat before reporting whether the desktop is connected.

# Edit the last user message

The pencil beside Copy is available for the original user message in the latest
terminal turn. Running turns, approval requests, queued messages, archived or
foreign-account sessions, protected desktop chats, and turns containing steering
or question replies cannot be edited. Older turns do not get this action.

The editor pre-fills the visible user text. Cancel does not modify history or the
composer draft. Confirm replaces the last turn and starts a new generation with
the existing attachments and session settings. This does not undo file changes
or external actions performed by the replaced turn.

## Additive v1 HTTP interface

`GET /codex-api/v1/message-edit?scope=<scope>` returns
`{editable:true,turnId,itemId,text,attachmentCount,revision}` for an eligible idle
session. The scope is `web:<profile>:<thread>` or `desktop:<thread>`. A stale or
ineligible session returns 409; authentication and ownership checks apply.

`POST /codex-api/v1/message-edit` accepts
`{scope,turnId,revision,requestId,message}`. Send the unchanged revision from the
preview and a unique requestId for this manual submission. Authentication and
CSRF checks are mandatory. Success returns
`{ok:true,requestId,replacedTurnId,turn?}`; desktop acceptance may omit `turn`.
400 means invalid/unchanged text, 401/403 deny authentication/authorization or
CSRF, and 409 includes stale state, concurrent work or an uncertain outcome.

Replaying the identical accepted request returns the saved result without a new
generation. Reusing its requestId for different input is rejected. An uncertain
submission is never automatically retried. The editor retains the edited text
and disables another submit until it is closed and state is checked again.

## Additive SSE event

`message-edited` carries `{scope,replacedTurnId}` after native history removal is
acknowledged. It carries no message body. Clients viewing that scope remove the
replaced turn and refresh native history. Other scopes are unaffected. Old
clients may ignore this new event; existing API fields, authentication and event
shapes are unchanged. There is no migration requirement for existing callers.

## Native operations and recovery

Desktop sessions use their existing owner connection and
`thread-follower-edit-last-user-turn` version 2. The owner preserves attachments,
chooses its supported revert implementation and starts the edited turn. The web
adapter does not take ownership or call an independent engine for these chats.

Web-owned sessions use `thread/revert` with the exact latest turn ID, followed by
`turn/start` with `turnTrigger: "edit_user_message"`. Only a definite unknown-method
response permits falling back to legacy `thread/rollback` with `numTurns:1`.
Neither history-removal method is exposed through generic browser RPC. The
existing access and approval policy is applied to the new turn.

Edits share the server composer queue's session lock. An additional engine guard
blocks conflicting sends while web history is being replaced. Private recovery
records under the configured data directory's `message-edits/` retain the
original turn and submission outcome before native mutation. A persistent list
of replaced turn IDs prevents cached desktop history pages from restoring old
replies. No recovery data is included in release or public download artifacts.

Validation uses deterministic fixture engines, simulated desktop IPC and browser
sessions connected to isolated services. It never sends edit controls to an
operator's current management conversation.

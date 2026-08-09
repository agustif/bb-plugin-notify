---
name: notify
description: Ping the user with an in-app toast or webhook when a milestone finishes, a blocker appears, or they asked to be told. Use the notify tool — do not invent other alert channels.
---

# Notify the user

Use the **`notify`** tool for agent→user pings. BB shows in-app toasts (and an
optional composer strip / header badge). When the user has granted OS
notification permission, background tabs (including bb connect remote
sessions) also raise a system notification. A configured webhook can receive
the same payload externally.

## When to use

- A long-running step finished and the user is likely looking away
- A blocker needs a human decision now
- The user explicitly asked to be notified
- A milestone in a multi-step plan landed

## When not to use

- Routine progress that the todo checklist already surfaces
- Every tool call or file edit
- Duplicate pings for the same event
- Todo worker idle/fail — the plugin auto-notifies those when settings allow

One notification per meaningful event. Prefer the live todo card for ongoing
step status; use notify for moments that deserve interruption.

## Parameters

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Short, scannable (≤200 chars) |
| `body` | no | Optional detail (≤2000 chars) |
| `level` | no | `info` (default) · `success` · `warning` · `error` |
| `channel` | no | `toast` · `webhook` — defaults to plugin setting |

## Examples

```json
{
  "title": "Tests passed",
  "body": "42 passed, 0 failed on main",
  "level": "success"
}
```

```json
{
  "title": "Need deploy approval",
  "body": "Migration is ready; waiting on go/no-go.",
  "level": "warning"
}
```

```json
{
  "title": "Build failed",
  "body": "Typecheck error in server.ts:112",
  "level": "error",
  "channel": "toast"
}
```

## Quiet hours, OS, & webhook

- Settings: `quietHours` as `HH:MM-HH:MM` (local server time). Empty = off.
- `defaultChannel` is `toast` or `webhook` when the tool omits `channel`.
- `showHeaderBadge` (boolean, default on) toggles the thread-header last-notify badge.
- Non-error notifications inside quiet hours are suppressed (tool still
  succeeds with a suppressed note). **error** always delivers.
- Channel `toast` fans out over realtime to every connected client (desktop,
  browser, bb connect). OS/browser notifications fire when permission is
  granted (background tab, or always for warning/error).
- `webhookUrl` is a secret setting (`http`/`https` only, no embedded
  credentials). Channel `webhook` POSTs JSON:
  `{ id, title, body, level, channel, threadId, projectId, createdAt, source }`.

## Auto-notify for todo workers

When the **todo** plugin dispatches a scout/worker/reviewer child (title like
`[Worker:id] …`, or `originPluginId: todo`), notify listens on:

| Event | Setting (default **on**) | Level |
| --- | --- | --- |
| `thread.idle` | `autoNotifyOnWorkerDone` | `success` |
| `thread.failed` | `autoNotifyOnWorkerFail` | `error` |

Quiet hours still apply to success pings; **error** always delivers. Turn
either flag off if you only want explicit `notify` tool calls.

Configure with:

```
bb plugin config notify
bb plugin config notify set quietHours 22:00-08:00
bb plugin config notify set defaultChannel toast
bb plugin config notify set showHeaderBadge true
bb plugin config notify set autoNotifyOnWorkerDone true
bb plugin config notify set autoNotifyOnWorkerFail true
bb notify status
bb notify send --level success "Hello"
```

# bb-plugin-notify

Agent→user notifications for [BB](https://github.com/get-bb/bb).

- **Tool** `notify` — `title`, optional `body`, `level`
  (`info|success|warning|error`), optional `channel` (`toast|webhook`)
- **Settings** — secret `webhookUrl`, `quietHours` (`HH:MM-HH:MM`),
  `defaultChannel`, `showHeaderBadge`, `autoNotifyOnWorkerDone`,
  `autoNotifyOnWorkerFail`
- **Channels**
  - `toast` — in-app sonner toast via realtime (local desktop, browser, and
    bb connect remote clients). Also raises an OS/browser `Notification` when
    permission is granted (background tab, or always for warning/error).
  - `webhook` — optional HTTPS/HTTP POST of JSON to a configured URL
- **Auto-notify** — on `thread.idle` / `thread.failed` for todo-dispatched
  workers (title `[Worker|Scout|Reviewer:…]` or `originPluginId: todo`),
  delivers success/error when the matching setting is on
- **UI** — toast bridge on composer + thread header, bare composer strip,
  header last-notify badge, settings status strip, sidebar footer to enable
  OS notifications
- **CLI** — `bb notify send|recent|status`
- **Skill** — `skills/notify/SKILL.md`

Pairs well with **[bb-plugin-todo](https://github.com/agustif/bb-plugin-todo)**
(worker auto-notify) and
**[bb-plugin-session-goal](https://github.com/agustif/bb-plugin-session-goal)**.

## Install

Requires **BB ≥ 0.36** and plugin SDK **^0.4.1**.

### From Git (recommended)

```sh
bb plugin install git:https://github.com/agustif/bb-plugin-notify.git@main
bb plugin reload notify
```

Pin a release:

```sh
bb plugin install git:https://github.com/agustif/bb-plugin-notify.git@v0.1.0
```

### From npm (when published)

```sh
bb plugin install npm:bb-plugin-notify@^0.1.0
bb plugin reload notify
```

### From a local checkout

```sh
git clone https://github.com/agustif/bb-plugin-notify.git
cd bb-plugin-notify
npm install
bb plugin install . --yes
bb plugin reload notify
```

## Configure

```sh
bb plugin config notify
bb plugin config notify set quietHours 22:00-08:00
bb plugin config notify set defaultChannel toast
bb plugin config notify set showHeaderBadge true
bb plugin config notify set autoNotifyOnWorkerDone true
bb plugin config notify set autoNotifyOnWorkerFail true
# webhook URL is secret — set via Settings UI or:
# bb plugin config notify set webhookUrl https://example.com/hook
```

Enable OS notifications from the sidebar footer action **Enable OS
notifications**, or click the 🔔 header badge once.

## Try it

```sh
bb notify send --level success "Scaffold complete" "bb-plugin-notify is live"
bb notify send --channel webhook "Hook test" "optional external ping"
bb notify recent
bb notify status
```

From an agent thread, call the `notify` tool with the same fields. Todo
worker children notify automatically when they go idle or fail (unless those
settings are off).

## Notes

- Quiet hours suppress non-`error` deliveries (toast and webhook).
- `error` always attempts delivery (including auto worker-fail).
- Webhook POSTs JSON with `Content-Type: application/json`.
- Webhook URLs must be `http:`/`https:` without embedded credentials.

## Develop

```sh
npm install
npm test
bb plugin types
bb plugin build
bb plugin install . --yes
bb plugin dev
```

## Publish (maintainers)

```sh
npm test && bb plugin build
git tag v0.1.0 && git push origin main --tags
gh release create v0.1.0 --generate-notes
# optional: npm login && npm publish --access public
```

## License

[MIT](./LICENSE)

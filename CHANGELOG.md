# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-09

### Added

- Agent tool `notify` with title, body, level, and channel
- Channels: in-app toast (realtime + optional OS notification) and webhook POST
- Settings: secret `webhookUrl`, quiet hours, default channel, header badge,
  auto-notify on todo worker idle/fail
- Composer strip, thread header badge, settings status, sidebar OS-permission action
- CLI: `bb notify send|recent|status`
- Skill `notify` for agent usage guidance
- Unit tests for quiet hours, webhook validation, delivery, and worker detection

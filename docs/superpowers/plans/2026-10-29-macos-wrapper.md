# TutorTrack macOS wrapper Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a Dock-launchable native Mac window for the existing local application.
**Architecture:** An AppKit/WKWebView executable starts a Python host over a private standard-input/output pipe. The host verifies a running server's project/data identity or owns a new loopback server, and shuts down that server when its parent disconnects.
**Tech Stack:** Swift, AppKit, WebKit, Python standard library, SQLite.
**Spec:** `docs/superpowers/specs/2026-10-29-macos-wrapper-design.md` (approved).

## Global constraints
- Preserve the project's existing database and uncommitted changes.
- Use installed Python; no cloud hosting or bundled student records.
- Produce `build/TutorTrack.app`, movable to Applications but linked to this project.
- Use native dialogs for uploads, exports, and confirmation; protect unsaved notes.

## Review focus
- An unrelated app occupies port 8765: never display or stop it.
- Parent crashes or quits: stop only the server the host owns.
- Project/Python disappears: show a helpful startup error.
- Native quit, reload, and window-close: protect unsaved notes.
- Links/downloads: keep the webview on the verified local origin and preserve backups.

## Task 1: Local server lifecycle
Files: `desktop/host.py`, `server.py`, `tests/test_desktop.py`.
- [x] Add integration tests that launch the host and assert ready URL, identity, reuse, foreign-port fallback, and EOF cleanup; run them before implementation.
- [x] Implement the identity route and the pipe-controlled host; use `--preferred-port` for deterministic integration checks.
- [x] Run the complete Python and JavaScript suites.

## Task 2: Native window and app bundle
Files: `desktop/TutorTrack.swift`, `desktop/build.py`, `desktop/Icon.swift`.
- [x] Write a Swift policy test for local URL routing and path/config validation, run before implementation.
- [x] Implement native startup, menus, window restoration/reopening, JS dialogs, file panels, downloads, external links, and guarded quit/reload.
- [x] Build a local `.app` with a generated native icon and project/Python configuration. Verify bundle and code signature.
- [x] Launch and exercise the app where computer-use access permits.

## Task 3: Handoff and verification
Files: `README.md`, `.gitignore`, this plan.
- [x] Document build, launching, Dock pinning, project dependency, data location, and troubleshooting.
- [x] Run all checks; obtain an independent code review; address material findings.
- [x] Deliver the built app and report GUI checks actually performed.

## Execution ledger
- Ruling: execute directly in the approved project, preserving all pre-existing edits; another approval/worktree detour would conflict with the user's explicit instruction to build the approved design. Do not commit the user's existing changes.
- Ruling: use inline execution; tasks depend on one another and do not benefit from separate implementers.
- Pre-flight: Task 2 consumes Task 1's single JSON readiness line `{url, owned}` and EOF-controlled lifetime.

- Verification: 31 Python tests, JavaScript syntax/frontend checks, and Swift policy assertions passed. App built and locally signed; installed copy signature verified.
- Independent review: addressed unsaved-note protection for local document navigation, including empty-path normalization.
- GUI: native window launches and loads existing student records. Further dialog and Dock-reopening checks were not completed: UI automation timed out and the user was actively using the app, so interaction stopped to avoid interference.
- Installed to `/Users/daniil/Applications/TutorTrack.app`; source bundle remains in `build/`. Project and database remain in their original locations.
- Build environment: iconutil succeeded outside the sandbox with the same generated icon assets.
- Handoff: leave existing uncommitted changes in place; no merge, push, or cleanup requested.

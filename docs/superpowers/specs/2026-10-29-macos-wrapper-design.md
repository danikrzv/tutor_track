# TutorTrack macOS wrapper

## Intent

Open TutorTrack from the Mac Dock in its own application window, without manually starting a terminal or opening a browser. Keep the current interface, features, and local records.

## Approaches

- **Native Mac wrapper — selected by the user.** A small macOS application using the installed Python runtime and the existing TutorTrack project. Quick to launch and maintain on this Mac.
- **Self-contained application — not selected.** Bundles Python and the application resources for easier transfer to another Mac, with a larger package and more packaging work.

## Proposed implementation

- Build `TutorTrack.app` using Swift, AppKit, and WebKit. The existing interface appears in an embedded web view with no browser address bar or tabs.
- Give the app a TutorTrack icon, standard Mac menus and keyboard shortcuts, a resizable window, and normal Dock activation. Reopening it brings its window forward.
- Double-clicking the app starts the Python server in the background and waits for it to become ready before displaying the interface. Startup failures show an actionable message instead of a blank window.
- Keep the application connected to this project's existing source and `data/` folder. Do not copy, move, replace, or embed student records in the application bundle. This lightweight wrapper depends on the project folder and installed Python remaining available.
- Reuse an existing server only after verifying that it belongs to this TutorTrack project. Otherwise start a separate loopback-only instance on an available port. Never stop an unrelated server or attach to an unidentified process.
- Preserve image selection and pasting, JavaScript confirmation dialogs, note-saving shortcuts, and unsaved-note protection. CSV exports and backups use Mac save dialogs. External web links open in the default browser; TutorTrack itself stays in its own window.
- Quitting stops a server launched by the wrapper. It leaves a pre-existing independently launched server running. Closing the window follows normal Mac app behavior, and clicking the Dock icon reopens it.
- Provide a reproducible build command and startup instructions in the README. Produce the app in the project so it can be moved to Applications and kept in the Dock. Installation outside the workspace uses the environment's required permission mechanism.

## Scope

This is a personal application for this Mac. It does not add cloud hosting, change the database format, rewrite the interface, or produce an App Store/notarized distribution. Bundling Python and supporting other computers are deferred.

## Validation

- Compile the native wrapper and verify its application bundle and icon.
- Check first launch, reopening, server reuse, startup errors, and owned-server cleanup.
- Verify file uploads, export/backup downloads, external links, confirmations, and unsaved-note behavior where GUI access is available; explicitly report any unverified GUI behavior.
- Run the existing backend and frontend checks to protect the web application.

## Approval

The user approved this design and explicitly authorized building it on 2026-10-29.

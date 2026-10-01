# TutorTrack

A private tutoring workspace with a local SQLite database. Runs on Python 3.10 or newer with **no dependencies, accounts, or cloud services**.

## Start

Open a terminal in this folder and run:

```sh
python3 server.py
```

Open **http://127.0.0.1:8765** in your browser. Keep the terminal running while you use TutorTrack. Press Ctrl+C to stop. To choose another port: `python3 server.py --port 8766`.

On macOS, you can also double-click **Start TutorTrack.command**, then follow the local link printed in the terminal.

## First steps

1. Open **Settings & backup** and choose your currency (defaults to CHF). The currency is fixed after creating lessons or packs; this prevents historical amounts from being silently relabelled. All records use one currency.
2. Add a student with their hourly rate, subject, email, phone, and useful details. Archive students to hide them while preserving their history.
3. Schedule a lesson from the overview or calendar. Click a calendar day to schedule on that date. Choose individual billing or a lesson pack. Overlapping appointments are rejected.
4. Click a lesson to reschedule it, cancel it, mark it completed, or open its notes.
5. Open **Accounts** to record full or partial payments, view payment history, or export a CSV.

## Billing rules

- Individually billed lessons become due when completed. Cost is the saved hourly rate multiplied by minutes / 60, rounded to the nearest cent. Later student rate changes do not change historical lessons.
- A lesson pack creates a charge for its full price at the time of sale. Record a payment separately when you receive it.
- Pack sessions have the duration specified when creating the pack. Scheduled sessions reserve space; completed sessions consume it. Cancelling a scheduled session releases its reservation.
- Completing a pack lesson never creates a second charge. A pack can be used before it is paid.
- Balances show the amount owed: completed individual lessons + pack sales − recorded payments. Payments cannot exceed an item's outstanding amount.
- A mistaken payment can be undone from payment history. This removes the record only; it does not transfer or refund money. Remove payments before reopening a paid individual lesson.
- CSV exports contain separate charge and payment rows. They are an income record, not a tax return or a full general ledger.
- Dates and lesson times use your computer's local wall-clock time. Times are not converted if you change time zones.

## Notes

Use the notebook for general notes, student notes, or a note attached to a particular lesson. Save with **Save note**, **Cmd+S**, or **Ctrl+S**. The app warns before leaving a note with unsaved changes.

The editor supports Markdown headings, bold, italics, strikethrough, bullet lists, checkboxes, blockquotes, fenced code, and links. Use `[[Exact note title]]` to link to another saved note. The **Preview** tab shows the formatted version. Raw HTML does not execute. This is a lightweight Markdown notebook, not a full Obsidian vault or plugin system.

Attach PNG, JPEG, GIF, or WebP images (up to 10 MB each), or paste an image from the clipboard into the editor. Images are stored locally. Markdown may also reference HTTPS images; those images require internet access and are loaded from their original host.

## Data and backups

All working data is stored in this project's **data/** directory:

```text
data/
  tutortrack.sqlite3
  uploads/
```

No student information is stored in browser local storage. Clearing browser history will not delete your database. The server listens only on `127.0.0.1`, and checks local request origins. It is designed for personal use on a trusted computer; it has no login and should not be exposed through a public tunnel or shared server.

Choose **Settings & backup → Download backup** for a ZIP containing a consistent database snapshot and all uploaded images. Store a copy on another drive. Backups are not encrypted.

To restore:

1. Stop TutorTrack with Ctrl+C.
2. Copy the current `data/` folder somewhere safe.
3. Extract the backup ZIP into `data/`, replacing `tutortrack.sqlite3` and restoring the `uploads/` directory.
4. Restart TutorTrack and reload the browser.

For an alternate data folder, set `TUTORTRACK_DATA` before starting. This is also how tests isolate their data. Do not move or replace the live database while the app is running.

## Development checks

```sh
python3 -m unittest discover -s tests -v
node --check static/app.js
node tests/test_frontend.cjs
```

The application uses Python's standard HTTP server and SQLite, plus plain HTML, CSS, and JavaScript. No build step or package installation is needed. Tests use temporary databases and never modify your student records.

Browsers with the optional WebMCP interface can read balances and pack progress through `get_tutoring_summary`. Ordinary browsers work without it. A supported browser session was unavailable during implementation, so browser interaction, visual layout, and live WebMCP registration have not been verified; automated server and frontend rendering checks passed.

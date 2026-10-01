# TutorTrack

A private tutoring workspace with a local SQLite database. Runs on Python 3.10 or newer with **no dependencies or accounts**. Student records stay local; currency conversion uses public daily exchange rates.

## Start

Open a terminal in this folder and run:

```sh
python3 server.py
```

Open **http://127.0.0.1:8765** in your browser. Keep the terminal running while you use TutorTrack. Press Ctrl+C to stop. To choose another port: `python3 server.py --port 8766`.

On macOS, you can also double-click **Start TutorTrack.command**, then follow the local link printed in the terminal.

## First steps

1. Open **Settings & backup** and choose your currency (defaults to CHF). This is your preferred currency for summary totals and can be changed anytime. Each student has their own billing currency.
2. Add a student with their billing currency, hourly rate, subject, email, phone, and useful details. Archive students to hide them while preserving their history.
3. Schedule a lesson from the overview or calendar. Click a calendar day to schedule on that date. Choose individual billing or a lesson pack. Overlapping appointments are rejected.
4. Click a lesson to reschedule it, cancel it, mark it completed, or open its notes.
5. Open **Accounts** to record full or partial payments, view payment history, or export a CSV.

## Billing rules

- Individually billed lessons become due when completed. Cost is the saved hourly rate multiplied by minutes / 60, rounded to the currency’s precision (whole yen/won for JPY/KRW; cents for the other supported currencies). Later student rate changes do not change historical lessons.
- A lesson pack creates a charge for its full price at the time of sale. Record a payment separately when you receive it.
- Pack sessions have the duration specified when creating the pack. Scheduled sessions reserve space; completed sessions consume it. Cancelling a scheduled session releases its reservation.
- Completing a pack lesson never creates a second charge. A pack can be used before it is paid.
- Balances show the amount owed: completed individual lessons + pack sales − recorded payments. Payments cannot exceed an item's outstanding amount.
- A mistaken payment can be undone from payment history. This removes the record only; it does not transfer or refund money. Remove payments before reopening a paid individual lesson.
- CSV exports contain separate charge and payment rows. They are an income record, not a tax return or a full general ledger.
- Dates and lesson times use your computer's local wall-clock time. Times are not converted if you change time zones.

## Weekly lessons

In the lesson window, choose **Repeat → Repeat weekly**, then set **Total lessons (including this one)** from 2 to 52. The app previews the first and last dates and creates one lesson each week at the same local time, including across daylight-saving changes.

This also works when editing a scheduled lesson: the selected lesson is the first occurrence, and the remaining weeks are added. When you save an edit, a popup lets you update only that lesson or that lesson and the later planned lessons in its weekly series. Only changed fields are applied; date/time changes shift the later lessons by the same interval. Completed and cancelled lessons are excluded. Cancelling a lesson still affects only that occurrence. Existing weekly batches created before this feature are linked conservatively when their consecutive records have identical details and dates exactly one week apart. There is no automatic extension beyond the chosen count.

If any date overlaps another lesson or the selected pack lacks enough available sessions, nothing is saved. Reduce the count or adjust the start time and try again. Repeated lessons follow normal billing: individual charges arise only when completed, and pack lessons never charge twice.

## Student currencies and conversion

Choose a **Billing currency** when adding or editing a student, and enter their hourly rate in that currency. Lessons and packs inherit it; payments use the currency of the charge being paid. Changing a student's currency affects new records only. Previously scheduled lessons retain their original currency when edited for the same student. Pack lessons keep the pack's currency.

Choose **Settings & backup → Your preferred currency** for overview totals and converted student balances. Accounts show original amounts alongside estimated equivalents. Student profiles also list outstanding balances by original currency, so debts in different currencies are never added as if they were the same unit.

The app fetches daily reference rates from [Frankfurter](https://frankfurter.dev/) when opened (cached for six hours). **Refresh rates** fetches again immediately. The rate dates and last successful check appear in the app. Only currency codes are requested; no names, contact details, notes, lesson amounts, or payments are sent. The SQLite database and uploaded images remain local.

If the internet or provider is unavailable, the app keeps its cached rates and displays a warning. If a needed rate has never been downloaded, the affected converted total is shown as unavailable, while original amounts remain usable. These are current-rate estimates, including conversions of past payments; they are not historical transaction valuations or guaranteed bank conversion amounts. Bank fees are not included.

CSV exports include original currencies and amounts, preferred currency equivalents, the applied exchange rate, and rate dates. Missing conversions are left blank. Database backups include cached rates. The one-time upgrade assigns existing records the application's previous currency and makes a `data/before-currencies-*.sqlite3` safety backup before adding currency fields.

## Time display

Choose **Settings & backup → Time format** for a 12-hour clock with AM/PM or a 24-hour clock (the default). The preference is saved locally and applies to lesson lists, the calendar, lesson details, and scheduling. Changing it does not change stored lesson times.

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

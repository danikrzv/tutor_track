# TutorTrack

A private tutoring workspace with a local SQLite database. Runs on Python 3.10 or newer with **no dependencies or accounts**. Student records stay local; currency conversion uses public daily exchange rates.

## Start

### Mac app (Dock)

Double-click **`build/TutorTrack.app`** to open TutorTrack in its own Mac window. The app starts its local server automatically; no Terminal window or browser tab is needed.

For everyday use, copy the app to **Applications**, open it, then right-click its Dock icon and choose **Options → Keep in Dock**. The app stays linked to this project folder and the Python installed on this Mac. Keep the project folder in place; moving just the `.app` is fine.

- **⌘S** saves the current note. **⌘R** reloads with an unsaved-note check.
- Closing the window keeps your workspace in memory; click the Dock icon to reopen it. **⌘Q** quits and checks for unsaved notes.
- File downloads use the Mac save dialog. Image attachments use a Mac file picker.
- **File → Show Data Folder** opens the existing `data/` folder. Nothing is moved into the application bundle.
- The wrapper stops only a server it started. It leaves an independently started TutorTrack server running.

To build or rebuild the Mac app after moving the project or updating the wrapper:

```sh
python3 desktop/build.py
```

Building requires Apple's Xcode Command Line Tools and uses no downloaded dependencies. The resulting app is for this Mac's architecture, locally signed, and not a notarized installer for distribution. After rebuilding, replace any older copy in Applications. If startup fails, the app displays a message; details are in `data/desktop.log`.

### Browser / development

Open a terminal in this folder and run:

```sh
python3 server.py
```

Open **http://127.0.0.1:8765** in your browser. Keep the terminal running while you use TutorTrack. Press Ctrl+C to stop. To choose another port: `python3 server.py --port 8766`.

On macOS, you can also double-click **Start TutorTrack.command**, then follow the local link printed in the terminal.

## First steps

1. Open **Settings & backup** and choose your currency (defaults to CHF). This is your preferred currency for summary totals and can be changed anytime. Each student has their own billing currency.
2. Add a student with their billing currency, hourly rate, subject, email, phone, and useful details. Archive students to hide them while preserving their history.
3. Schedule a lesson from the overview or calendar. Click a calendar day to schedule on that date. Every lesson has a recorded hourly rate; available student credit pays it when completed. Overlapping appointments are rejected.
4. Click a lesson to reschedule it, cancel it, mark it completed, or open its notes. Available student credit is applied automatically when completed.
5. Open **Accounts** to record full or partial payments, view payment history, or export a CSV.

## Student credit and billing

- Every completed lesson creates a charge at its saved hourly rate and duration. Scheduled and cancelled lessons do not use credit. Later rate changes do not change earlier lesson prices.
- **Packs & credit** records a monetary top-up. A $330 pack means $330 credit, not a separate type of lesson or exactly ten sessions. The pack's lesson count and duration are descriptive; actual lessons use their recorded prices.
- When selling a pack, choose **Payment received** to record the full receipt and add credit immediately, or **Awaiting payment** to record the planned purchase without adding money. Record partial payments from the pack card. An unpaid pack is tracked separately and is not added to lesson debt.
- Received pack payments automatically cover the student's oldest unpaid completed lessons in the same currency. Remaining credit pays future lessons as they are completed. The profile shows **Amount due** or **Credit available**, with original balances per currency. USD credit cannot pay an EUR charge; converted totals are estimates for display only.
- Use **Record payment / credit** on the student profile or Accounts for a payment without a pack. For an existing pack, record its payment on that pack to keep its payment status up to date. Never enter the same receipt twice.
- Existing payments made for specific lessons remain attached to those lessons; student credit covers whatever is left. A payment recorded on a lesson cannot exceed its remaining amount after credit. General student payments can exceed debt; the excess stays as credit.
- Reopening a lesson covered by credit makes that credit available again. For a lesson with a directly attached payment, remove that payment first. Undoing a payment recalculates credit and unpaid lessons; it only removes the record and does not transfer or refund money.
- CSV exports list completed lesson charges and money received once each. Pack purchases are not duplicate charges. This is an income record, not a tax return or full general ledger.

### Existing pack migration

On first opening this version, TutorTrack saves a `data/before-credit-*.sqlite3` backup and converts existing pack receipts to student credit, preserving payment IDs, dates, methods and amounts. It does not create a second payment. Existing pack-linked lessons had zero prices; those receive the agreed pack price divided by its lesson count, rounded to the currency precision. Their old pack association is retained internally for history, but they become regular lessons. Date-only edits preserve that migrated price. Pack division can leave a small rounding remainder. Existing individually priced lessons keep their saved prices. Quit and reopen the Mac app (or restart the terminal server) after updating to activate this change.

## Weekly lessons

In the lesson window, choose **Repeat → Repeat weekly**, then set **Total lessons (including this one)** from 2 to 52. Saving automatically creates the upcoming lessons (four total by default). The app previews the first and last dates and creates one lesson each week at the same local time, including across daylight-saving changes.

This also works when editing a scheduled lesson: the selected lesson is the first occurrence, and the remaining weeks are added. When you save an edit, a popup lets you update only that lesson or that lesson and the later planned lessons in its weekly series. Only changed fields are applied; date/time changes shift the later lessons by the same interval. Completed and cancelled lessons are excluded. Cancelling a lesson still affects only that occurrence. Existing weekly batches created before this feature are linked conservatively when their consecutive records have identical details and dates exactly one week apart. Weekly lessons display their repeat setting when reopened. Change the total count to create missing future dates; already scheduled, completed, or cancelled occurrences are not duplicated. Ordinary edits do not generate extra lessons. There is no automatic extension beyond the chosen count.

If any date overlaps another lesson, nothing is saved. Reduce the count or adjust the start time and try again. Repeated lessons follow normal billing: charges arise only when completed and available student credit applies automatically. Scheduling does not reserve or consume credit.

## Continuous calendar

The Week and Month calendars scroll continuously. Scroll upward for earlier dates or downward for later dates; TutorTrack loads more periods as you approach either end and keeps only a small window of dates rendered for performance. The heading follows the dates currently in view.

Use **Today** to return to the current week or month. The arrow buttons still move one period at a time, and clicking any day opens the lesson form for that date. Calendar navigation is limited to the same supported scheduling range, from 2000 through 2100.

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

1. Quit the Mac app with ⌘Q, or stop the terminal server with Ctrl+C.
2. Copy the current `data/` folder somewhere safe.
3. Extract the backup ZIP into `data/`, replacing `tutortrack.sqlite3` and restoring the `uploads/` directory.
4. Reopen the Mac app, or restart the server and reload the browser.

For an alternate data folder, set `TUTORTRACK_DATA` before starting. This is also how tests isolate their data. Do not move or replace the live database while the app is running.

## Development checks

```sh
python3 -m unittest discover -s tests -v
node --check static/app.js
node tests/test_frontend.cjs
xcrun swiftc -module-cache-path /tmp/tutortrack-swift-cache desktop/Policy.swift desktop/PolicyTests.swift -o build/policy-tests
build/policy-tests
```

The application uses Python's standard HTTP server and SQLite, plus plain HTML, CSS, and JavaScript. The browser version needs no build step or package installation. Tests use temporary databases and never modify your student records.

The Mac wrapper adds Swift/AppKit/WebKit. Its process integration tests start temporary loopback servers, so they need permission to bind local sockets when run inside a sandbox.

Browsers with the optional WebMCP interface can read balances and pack progress through `get_tutoring_summary`. Ordinary browsers work without it. A supported browser session was unavailable during implementation, so browser interaction, visual layout, and live WebMCP registration have not been verified; automated server and frontend rendering checks passed.

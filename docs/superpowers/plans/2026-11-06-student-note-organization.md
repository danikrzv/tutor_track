# Student Note Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename lesson-note displays to student name plus lesson date, order the newest notes first, add student filtering, and connect student profiles directly to their notes.

**Architecture:** Keep the existing notes schema and stored `title` field as the optional topic. Add small frontend derivation helpers that obtain a lesson note's display title and ordering date from its linked student and lesson, then use those helpers consistently in the notebook, editor, search, filtering, and student-profile navigation.

**Tech Stack:** Plain JavaScript, HTML templates, CSS, Node frontend checks, Python unittest regression suite.

**Spec:** `docs/superpowers/specs/2026-11-06-student-note-organization-design.md`

## Global Constraints

- A lesson-note main title is `Student name · localized lesson date`; its stored title remains an optional topic.
- Lesson notes sort by lesson start; other notes sort by `updated`; the combined list is newest first.
- Search and student filtering compose rather than replace one another.
- General notes retain their editable title.
- Existing note bodies, titles, images, and links remain unchanged; no database migration is needed.
- Preserve all unrelated working-tree changes and do not create a commit unless the user explicitly asks.

## Review Focus

- A missing/deleted linked lesson must not crash the notebook; fall back to the stored title and `updated` timestamp.
- Two lessons for one student on the same day may share a main title; their topic, time/order, and preview must keep both accessible.
- Archived students with notes must remain available in the filter.
- Opening a student note from a profile must preserve unsaved-note protection.
- Filtering must not leave an invisible note selected in the editor.

---

### Task 1: Note identity, ordering, and filtering

**Files:**
- Modify: `static/app.js`
- Modify: `static/style.css`
- Test: `tests/test_frontend.cjs`

**Interfaces:**
- Consumes: existing `data.notes`, `data.lessons`, `data.students`, `dateLabel()`, `openNote()`, and delegated `data-action` events.
- Produces: `noteLesson(note)`, `noteDate(note)`, `noteDisplayTitle(note)`, `visibleNotes()`, and `noteStudentFilter` state used by every notebook entry point.

- [x] **Step 1: Add failing frontend assertions**

Add real-data assertions that lesson notes display `Ada · <lesson date>` instead of their stored topic, sort newest-first by lesson start, retain a non-lesson title, combine text search with student/general filters, include archived students with notes, and fall back safely when a linked lesson is missing.

- [x] **Step 2: Run the frontend checks and confirm the new assertions fail**

Run: `node tests/test_frontend.cjs`

Expected: failure because the note derivation/filter helpers and UI controls do not exist.

- [x] **Step 3: Implement the derivation and list behavior**

Add the named helpers and render the notebook list from `visibleNotes()`. Sort descending by `noteDate()`, then `updated`, then numeric ID. Search automatic display titles, stored topics, bodies, and student names. Render a labeled student select containing All students, General notes, and every student represented in notes.

- [x] **Step 4: Implement editor and filter interactions**

For lesson notes, render the automatic title as the editor heading and label the existing editable `title` input **Topic (optional)**. For other notes, keep the current editable note title. On filter changes, clear `selectedNote`, `noteDraft`, and `dirty` only after the normal unsaved-change confirmation allows navigation.

- [x] **Step 5: Run frontend checks**

Run: `node --check static/app.js && node tests/test_frontend.cjs`

Expected: syntax check and all frontend assertions pass.

### Task 2: Student-profile access and handoff

**Files:**
- Modify: `static/app.js`
- Modify: `static/style.css`
- Modify: `README.md`
- Test: `tests/test_frontend.cjs`

**Interfaces:**
- Consumes: Task 1's `noteStudentFilter`, `noteDisplayTitle()`, and `visibleNotes()`.
- Produces: `openStudentNotes(studentId)` and a delegated `student-notes` action.

- [x] **Step 1: Add failing navigation assertions**

Assert that a student profile renders **View all notes**, that invoking `openStudentNotes(1)` opens route `notes` with filter `1`, and that individual profile note rows use the automatic display title while still opening the selected note.

- [x] **Step 2: Run the frontend checks and confirm the new assertions fail**

Run: `node tests/test_frontend.cjs`

Expected: failure because the profile action and navigation helper do not exist.

- [x] **Step 3: Implement student-profile navigation**

Add **View all notes** beside **Add note**, use `noteDisplayTitle()` in profile rows, and implement `openStudentNotes(studentId)` through the same unsaved-note guard used by other note navigation. Keep **Add note** preselecting the profile student and individual note rows opening directly.

- [x] **Step 4: Update documentation**

Document lesson-note naming, newest-first ordering, student filtering, general-note behavior, and student-profile access in `README.md`.

- [x] **Step 5: Run complete verification**

Run:

```sh
node --check static/app.js
node tests/test_frontend.cjs
node tests/test_calendar.cjs
python3 -m unittest discover -s tests -v
git diff --check
```

Expected: all checks pass. Desktop integration tests may require local socket permission outside the sandbox.

- [x] **Step 6: Verify in the native Mac app**

Reload TutorTrack, confirm the newest lesson note appears first with student/date naming, exercise the student filter and profile **View all notes**, and leave all test dialogs without saving or changing records.

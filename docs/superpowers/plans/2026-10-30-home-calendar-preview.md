# Home Calendar Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the overview page’s “Coming up” list with a compact seven-day calendar preview and move payments into the adjacent right-hand column.

**Architecture:** Keep the change inside the existing vanilla-JS overview renderer and shared stylesheet. Build the preview from the existing `weekStart`, `calendarEvent`, and lesson-detail action patterns, while retaining the current payment table and actions. Use CSS grid for desktop columns and stack the sections at the existing responsive breakpoint.

**Tech Stack:** Vanilla JavaScript, HTML template strings, CSS, Node-based frontend tests.

**Spec:** `docs/superpowers/specs/2026-10-30-home-calendar-preview-design.md`

## Global Constraints

- No backend or data-model changes.
- Preserve the full Calendar page’s week/month navigation.
- Preserve existing payment calculations, payment recording, empty states, and responsive behavior.
- Use the current week anchored to today.

## Review Focus

- Lessons across the current week, including days with no lessons, render in the correct day column.
- Cancelled lessons do not appear in the preview.
- Clicking a preview lesson continues to use the existing lesson-detail action.
- Outstanding payments remain actionable through “Record payment” and “View accounts”.
- The preview and payments stack cleanly on narrow screens.

### Task 1: Build the overview calendar/payments composition

**Files:**
- Modify: `static/app.js:overview()` and nearby overview helpers
- Modify: `static/style.css` overview/calendar preview styles and responsive rules
- Test: `tests/test_frontend.cjs`

**Interfaces:**
- Consumes: existing `data.lessons`, `charges()`, `chargeTable()`, `weekStart()`, `calendarEvent()`, `student()`, and event delegation.
- Produces: overview markup with a seven-day preview, a right-side payments panel, existing quick actions below/alongside the main content, and stable selectors for frontend tests.

- [ ] **Step 1: Add frontend assertions for the new overview structure**

  Extend the overview render coverage to assert that the overview includes a dedicated seven-day preview container, day headers for the current week, the “Payments to follow up” heading, and an existing payment action when due items exist. Assert that a cancelled lesson is not rendered in the preview.

- [ ] **Step 2: Run the focused frontend test to verify the new assertions fail**

  Run: `node tests/test_frontend.cjs`

  Expected: FAIL because the current overview still renders “Coming up” and the payments table below it.

- [ ] **Step 3: Implement the compact preview in `static/app.js`**

  Add a small overview-specific week renderer that anchors to `weekStart(new Date())`, creates seven day columns, filters out cancelled lessons, sorts lessons by start time, and renders each lesson through the existing `calendarEvent()` interaction. Replace the current “Coming up” section with this preview, move the existing payments panel into the adjacent grid column, and retain the quick actions/teaching card as a secondary area.

- [ ] **Step 4: Style the new composition in `static/style.css`**

  Add overview preview styles for the seven columns, day headers, today state, event cards, empty day slots, and the adjacent payments panel. At the existing mobile breakpoint, stack the preview and payments sections and keep event content readable without changing full-calendar styles.

- [ ] **Step 5: Run frontend and calendar regression tests**

  Run: `node tests/test_frontend.cjs && node tests/test_calendar.cjs`

  Expected: PASS with existing overview, full calendar, payment, and lesson interaction coverage intact.

- [ ] **Step 6: Review the diff for scope and responsive regressions**

  Run: `git diff -- static/app.js static/style.css tests/test_frontend.cjs`

  Confirm that only the overview composition, its styles, and focused frontend assertions changed; no backend or full Calendar behavior changed.

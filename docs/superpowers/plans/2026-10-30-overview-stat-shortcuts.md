# Overview Stat Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the four overview stat callouts navigate to their related app sections when activated.

**Architecture:** Extend the existing `stats()` helper with optional navigation metadata. Overview passes four destinations, causing only those cards to render as semantic buttons with `data-nav`; all other stats remain unchanged. Reuse the existing delegated navigation handler and add only the necessary button styling.

**Tech Stack:** Vanilla JavaScript, HTML template strings, CSS, Node-based frontend tests.

**Spec:** `docs/superpowers/specs/2026-10-30-overview-stat-shortcuts-design.md`

## Global Constraints

- Keep the change overview-only; shared stats on Accounts and student profiles remain non-navigational.
- Use the existing delegated `data-nav` navigation behavior.
- Do not change counts, amounts, billing logic, or destination-page content.

## Review Focus

- Each overview label maps to the correct destination.
- Stat cards remain keyboard-accessible semantic buttons.
- Account and student-profile stats do not gain unintended navigation attributes.
- Existing stat visual hierarchy and layout remain intact.
- Existing frontend and calendar behavior remains regression-free.

### Task 1: Add overview stat navigation shortcuts

**Files:**
- Modify: `static/app.js:stats()` and `overview()`
- Modify: `static/style.css` stat-card button styling
- Test: `tests/test_frontend.cjs`

**Interfaces:**
- Consumes: existing `stats()` callers, `data-nav` delegation, and route names `calendar`, `students`, and `accounts`.
- Produces: overview stat buttons with destinations `calendar`, `students`, `accounts`, `accounts`; non-overview stat cards remain plain stat elements.

- [ ] **Step 1: Add failing frontend assertions**

  Render the overview and assert that the four labels are inside stat buttons with the exact destination attributes. Render Accounts and a student profile and assert their stat sections do not contain `data-nav`.

- [ ] **Step 2: Run the frontend test to verify it fails**

  Run: `node tests/test_frontend.cjs`

  Expected: FAIL because the current `stats()` helper renders every card as a plain `<div>`.

- [ ] **Step 3: Implement optional navigation metadata**

  Update `stats(items)` to accept an optional sixth item value for a destination and choose a `<button class="stat" data-nav="...">` wrapper only when present. Pass the four overview destinations while leaving other `stats()` calls unchanged.

- [ ] **Step 4: Preserve button presentation in CSS**

  Add stat-button rules to remove default button chrome, keep text aligned, and provide hover/focus affordances without changing the existing grid sizing.

- [ ] **Step 5: Run regression tests and syntax verification**

  Run: `node --check static/app.js && node tests/test_frontend.cjs && node tests/test_calendar.cjs && git diff --check`

  Expected: PASS with all frontend/calendar checks green and no whitespace errors.

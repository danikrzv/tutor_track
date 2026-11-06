# Overview Stat Shortcuts Design

## Intent

Turn the four overview summary callouts into useful shortcuts to the related app sections.

## Goals

- Make the overview cards real keyboard-accessible buttons.
- Route Today’s lessons to Calendar, Active students to Students, and both payment summaries to Accounts.
- Keep the shared stats helper’s existing non-overview uses unchanged.

## Non-goals

- No changes to counts, amounts, billing logic, or destination-page content.
- No changes to the full Calendar, Accounts, Students, or student-profile pages.

## Approach

The shared `stats()` helper will accept optional navigation metadata and render a `<button>` card only when a destination is supplied. Overview will pass the four mappings; other pages will continue rendering their existing non-clickable stat cards. Existing delegated `data-nav` handling will perform navigation, with CSS preserving the current card appearance and adding a clear hover/focus affordance.

## Verification

Add frontend assertions for all four `data-nav` destinations and confirm account/profile stats remain non-navigational. Run the existing frontend and calendar regression tests.

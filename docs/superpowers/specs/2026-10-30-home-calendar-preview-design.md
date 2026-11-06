# Home Calendar Preview Design

## Intent

Replace the overview page’s large “Coming up” lesson list with a compact seven-day calendar preview, and place “Payments to follow up” beside it so the home page uses its main content area for two useful, glanceable workflows.

## Goals

- Show the current week’s dates and scheduled lessons on the overview page.
- Keep lesson details readable and let users open the existing lesson detail flow.
- Put outstanding payments in a right-hand panel on desktop.
- Preserve the existing full Calendar page, payment actions, empty states, and responsive behavior.

## Non-goals

- No backend or data-model changes.
- No changes to the full Calendar page’s week/month navigation.
- No changes to payment calculations or payment recording behavior.

## Approach

Considered a mini month grid, but it would duplicate the full Calendar view and make lesson details too dense. The selected approach is a compact seven-day preview that reuses existing calendar data and event markup, with the payments panel as the adjacent column. On narrow screens the columns stack, keeping both sections usable.

## Implementation calls

- Use the current calendar week anchored to today.
- Reuse existing calendar event styling and lesson detail actions where practical.
- Show a concise empty state when the week has no scheduled lessons, with a link to the full Calendar/new lesson flow.
- Keep the existing “View accounts” action in the payments panel.

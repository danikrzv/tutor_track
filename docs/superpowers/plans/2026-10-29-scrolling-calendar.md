# Continuously scrolling calendar

User request: make the existing calendar infinite-scroll. Implement inline; no backend or data changes.

- Render adjacent weeks/months in a keyboard-scrollable calendar pane; retain Today, previous/next and view controls.
- Add periods at either edge, retaining at most 12 periods. Preserve the visible period and pixel offset when prepending/removing content and after lesson updates.
- Use local calendar date arithmetic (including DST/year changes), not fixed millisecond increments. Respect scheduling's supported 2000–2100 date range.
- Test date transitions, contiguous ranges, bounded edge updates, and existing rendering/forms. Verify scrolling and Today in the native app without changing records.

## Verification record

- Implemented continuous scrolling in Week and Month views with a maximum of 12 rendered periods.
- Automated checks cover date boundaries, both scroll directions, contiguous periods, stable viewport anchoring, and bounded rendering.
- Native app checks loaded additional earlier and later weeks and months, and verified that Today returns to the current period. No lesson records were changed.
- Independent review found no material correctness, performance, or accessibility issues.

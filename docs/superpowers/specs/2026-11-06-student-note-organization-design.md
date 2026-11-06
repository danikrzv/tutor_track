# Student-centered notebook design

## Intent

Make student notes easy to recognize and retrieve. Lesson notes use the student's name and lesson date as their visible title, the newest notes appear first, the notebook can be filtered by student, and the student profile provides direct access to both individual notes and the student's complete notebook view.

## Behavior

- A lesson note displays an automatic main title such as `Masha · 24 oct.` using the student's name and the lesson date in the app's existing localized date format.
- Lesson notes are ordered by lesson date and time, newest first. Other notes are ordered by their last-updated time. When combined, each note's applicable date determines one descending list, so the most recent item is always at the top.
- The existing editable title becomes an optional **Topic** displayed below the automatic lesson-note title. Existing note titles are preserved as topics during the change.
- Renaming a student immediately changes the student-name portion of lesson-note titles without rewriting note history.
- A manually created student note is not tied to a lesson, so it retains its editable title rather than pretending to have a lesson date.
- General notes that are not linked to a student retain their editable titles because there is no student name from which to generate one.
- The notebook sidebar adds a student filter with **All students**, **General notes**, and every student who has notes, including archived students. Search and the student filter work together.
- Each student profile continues to list individual notes. It also adds **View all notes**, which opens the notebook already filtered to that student. Selecting an individual note opens it directly in the notebook.
- Creating a note from a student profile preselects that student. Creating a note from a lesson keeps the lesson association and automatic lesson date.

## Data and compatibility

- No note-date migration is required: lesson-note titles and sorting derive from their linked lesson's existing start date, while other notes continue using their existing `updated` timestamp.
- The API keeps the existing `title` field as the stored optional topic for backward compatibility. The automatic lesson-note title is derived in the interface from the linked student and lesson.
- Markdown `[[Exact note title]]` links continue resolving stored topics for compatibility. Automatic display titles also resolve when they identify one note unambiguously; duplicate same-student/same-date titles remain distinguishable by topic in the note list.

## Approaches considered

1. **Derived lesson title plus optional topic — selected.** Preserves multiple notes, historical topics, and student renames while giving every lesson note the requested student-name and date format.
2. Rewrite the stored title once when a note is created. Simpler, but student renames would leave stale titles and existing topics would be lost or require another field anyway.
3. Merge all notes for one student and date. Avoids duplicate titles, but combines separate lessons and removes the flexibility of independent notes.

## Scope limits

This change does not merge or delete notes, rename uploaded images, change billing or lesson records, or introduce folders on disk. Duplicate notes on the same date are allowed and are separated by their topic and preview.

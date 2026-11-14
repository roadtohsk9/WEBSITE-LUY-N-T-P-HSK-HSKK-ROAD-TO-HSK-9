# Personalization & IELTS-style Review Update

## Student experience
- Added a custom-category group to the main test selector, separate from HSK 3–6. Tests assigned to categories created in the Admin category manager can be browsed directly from the home page.
- Added a learning dashboard for saved vocabulary, number of submitted tests, correct answers, and overall accuracy/progress.
- Added a floating study utility bar to exam and personalization pages: quick dictionary, notes, vocabulary review flashcards, and a shortcut to the personal learning space.
- Dictionary lookup supports English and Chinese queries through the server API, with links to Google Translate and an external dictionary as fallbacks.
- Personalized vocabulary and learning history are stored in a browser-local key scoped by the logged-in username where available. Existing legacy data is migrated the first time the account opens the learning page.

## Exam interface
- Reading passages use the saved per-passage alignment. HSK 5/6 Reading defaults to justified alignment when no alignment setting exists.
- After submitting, the results view presents the exam on the left and answer keys/explanations on the right on desktop. The two panes scroll independently. Smaller screens stack the panes vertically.
- The submitted exam pane preserves selected choices and typed answers for comparison.
- Explanations can include a per-question explanation or a shared explanation attached to the question group.

## Admin
- Added a per-passage/section text-alignment selector: left, justified, centered, or right.
- Added a text-alignment option to the document-import form and stores it as the imported test's default alignment.

## Validation
- `node --check` passed for the server and all client-side JavaScript files.
- Inline scripts in the home page, exam page, and admin page passed syntax checks.
- This update has not been connected to a live PostgreSQL database in this environment; verify API-backed behavior in the deployment environment.

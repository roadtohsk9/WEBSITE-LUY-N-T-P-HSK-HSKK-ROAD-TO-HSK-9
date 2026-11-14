# EIT IELTS — Result / Answer / Explanation V31

## Updated
- Reading + Listening bottom-right tick now reliably opens the **Submit Now / Check again** confirmation card.
- Submit flow now redirects to a dedicated **Test Results** page.
- Results show correct, wrong, skipped, accuracy and estimated IELTS band.
- Reading result review is grouped into **PASSAGE 1 / 2 / 3** cards.
- Listening result review is grouped into **SECTION 1 / 2 / 3 / 4** cards.
- Answer Review shows correct answers in green and wrong user answers in red with strike-through, followed by the correct answer in green.
- Completion/Summary answers are rendered inline at the blank position; correct answers use the blue highlight style.
- Detailed Explanation is grouped by question cluster and supports a collapsible **EXPLANATION** button for every question.
- Admin Builder's existing group explanation field is surfaced in the detailed explanation page.
- Admin Answer Key editor now also supports saving group-level explanations.
- Reading navigation always shows Passage 1/2/3 with answered counts.
- Listening audio is persistent at the top of the test pane and no longer disappears when switching sections.
- Practice Listening now uses the API's `audioUrl` field correctly.
- Reading/Listening timers use the test's configured `durationMinutes` and submit the elapsed time.
- Submit failures unlock the submit action again so the student can retry.

## Main files
- `js/practice-test.js`
- `js/practice-result.js`
- `css/site.css`
- `admin/index.html`
- `server.js`

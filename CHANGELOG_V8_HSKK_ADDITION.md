# ROAD TO HSK9 V8 — HSKK Addition (keeps V7 intact)

## Scope
- Built on the V7 unified HSK 7–9 source. Existing Listening, Reading, HSK Writing, Translation, four-skill mock exam, HSK 7/8/9 post-score estimate, PRO, material store, personalization, vocabulary, notes, flashcards and admin flows are retained.
- Added HSKK as a separate fifth speaking module. It does not replace HSK Writing and does not enter the four-skill HSK 7–9 mock-exam conversion.

## HSKK
- Six separate configurations: HSKK 2.0 / HSK Speaking 3.0 × Beginner / Intermediate / Advanced.
- Question structures are generated as 27 / 14 / 6 questions according to level.
- Admin HSKK Studio supports audio/image upload, question text, preparation seconds and response seconds per question.
- For audio questions, recording and response countdown start immediately on audio end. Each response is saved and the next question starts automatically.
- Gemini receives the original question audio, original question image (where present) and student recording for feedback.

## Access and data
- HSKK has independent PRO permission (`speaking`) and separate volume codes 20/21/22 for HSKK 2.0 and 30/31/32 for HSK Speaking 3.0.
- The legacy HSK 7–9 migration now explicitly preserves HSKK banks. HSKK is not mixed into the unified HSK 7–9 question bank.
- Original four-skill PRO entitlements remain; Admin can add HSKK as a fifth selectable skill. Course PRO continues unlocking the original four skills and does not implicitly override separately managed HSKK access.

## Validation
- Node syntax checks passed for server, Gemini grading module, HSKK exam client and inline scripts in the new HSKK/Admin pages.
- Full PostgreSQL migration and live Gemini grading require the user's configured database/API key and have not been exercised in this environment.

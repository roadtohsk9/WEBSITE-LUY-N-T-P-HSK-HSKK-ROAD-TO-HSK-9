# EIT IELTS V42 — Final Fixes

## Reading / Listening answer persistence
- Summary/Note/Completion inputs now persist to both localStorage and sessionStorage.
- Final submit takes a fresh DOM snapshot before scoring.
- Switching Reading passages / Listening sections restores typed answers.
- Fallback completion and short-answer inputs render their saved values.
- Map/matching selects restore the previously chosen option.

## Learning tools
- Added the right-side learning rail to Answer Review and Detailed Explanation.
- Tabs: Overview, Dictionary, Vocabulary, Collocations, Synonyms, Antonyms, Structures, Vocabulary PDF.
- Quick-note inputs let students save learning items directly to Personalization.
- Vocabulary PDF opens the PDF attached to the current Reading/Listening test.

## Dictionary
- Added same-origin `/api/dictionary` proxy for Free Dictionary API.
- Browser first uses the EIT server proxy, then falls back to the public API.
- Cambridge Dictionary and Google Translate remain available as external fallbacks.

## Google Login
- Added server-side Google OAuth Authorization Code flow.
- Added secure state + one-time handoff code between Google callback and login page.
- Login page prefers server-side OAuth to avoid browser JavaScript-origin mismatch failures.
- Added Vibe Host environment variables to `.env.example`.

## Motion / UI
- Reused the existing V41 learning-rail motion system and reduced-motion support.

## Admin
- Preserved per-test vocabulary PDF upload for Reading/Listening builder flows used by both VOL and Practice tests.

# V43: restore independent scrolling in Reading/Listening Detailed Explanation panes.

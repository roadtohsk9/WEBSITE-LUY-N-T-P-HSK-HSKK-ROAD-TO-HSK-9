# EIT AI grading setup

AI grading runs **server-side**. Do not put the Gemini API key in frontend JavaScript or commit it into the ZIP.

## Required Environment Variables on VibeHost

- `GEMINI_API_KEY` = your Google AI Studio / Gemini API key
- `GEMINI_MODEL` = `gemini-3.6-flash`
- `GEMINI_FALLBACK_MODEL` = optional, comma-separated list of backup models to use automatically when the primary model returns a "high demand / overloaded" (429/503) error. Defaults to `gemini-3.6-flash`.
- `GEMINI_TIMEOUT_MS` = optional, defaults to `90000`

After adding or changing environment variables, **redeploy/restart the app** so the Node process loads them.

## What the app does

### Writing

- AI grading runs immediately during submission.
- The result page shows the estimated overall Writing band.
- Task 2 carries twice the weight of Task 1 when calculating the Writing result.
- PRO users with active `writing` entitlement can view the four-criterion breakdown, examiner-style feedback, sentence-level corrections, explanations, better options and revised excerpts.
- Free users can see the overall band, while detailed correction remains locked behind PRO.
- Task 1 and Task 2 prompt images are sent to Gemini when available.

### Speaking

- Submitted recordings are sent to Gemini for grading.
- The result page shows the estimated overall Speaking band.
- PRO users with active `speaking` entitlement can view the four-criterion breakdown, faithful transcript, part-by-part feedback and pronunciation targets.

### Diagnostic endpoint

Open `/api/ai/status` on the deployed app to verify:

- whether `GEMINI_API_KEY` is configured (`true/false` only; the key itself is never returned)
- the active Gemini model
- whether PostgreSQL is available

## Security

- Gemini API credentials stay on the server.
- The frontend never receives the Gemini API key.
- Google OAuth Client ID is separate from the Gemini API key.

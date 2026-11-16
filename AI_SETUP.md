# Server-side AI configuration

AI credentials must remain on the server. Never place API keys in frontend JavaScript, HTML, public JSON files or GitHub commits.

## Required environment variable

- `DEEPSEEK_API_KEY`: server-side key used by the website's Writing/Speaking text review and HSKK recognition-and-feedback pipeline.

Optional settings for other skill reviews:
- `DEEPSEEK_MODEL`
- `DEEPSEEK_VISION_MODEL`
- `DEEPSEEK_TIMEOUT_MS`

Optional settings for HSKK:
- `HSKK_DEEPSEEK_MODEL` (recommended `deepseek-flash`; existing Render values override source defaults)
- `HSKK_AI_TIMEOUT_MS` (default `240000` milliseconds)

After adding or changing variables in Render → Environment, save and redeploy/restart the service.

## HSKK processing flow

HSKK audio is normalized in the browser to 16-bit PCM WAV, mono, 16 kHz and divided into segments no longer than 110 seconds. The server sends each segment to speech recognition, combines the resulting transcripts in question order, then sends the transcript, task prompt and Admin-provided reference text (if present) to the text evaluator.

The HSKK feedback evaluates task achievement, content accuracy, response organization, idea development, grammar and vocabulary from the transcript. The current path does **not** directly evaluate pronunciation, tones, initials/finals, prosody, speaking speed or hesitation. These criteria are marked as unavailable instead of being assigned unsupported scores. ASR transcripts may contain omissions or recognition errors and should be reviewed as practice feedback, not an official test score.

See `HSKK_DEEPSEEK_SETUP_VI.md` for Render configuration, audio limits, scoring scope and test steps.

## Status check

- `/api/ai/status` reports whether the shared server-side key is configured for the website's other AI review features.
- `/api/hskk/ai-status` reports only whether the HSKK analysis service is configured. It does not return the provider name, model name or API key to the browser.


## Token-efficient DeepSeek settings

Recommended model: `deepseek-flash` for text and vision grading. Use `DEEPSEEK_MODEL=deepseek-flash`, `DEEPSEEK_VISION_MODEL=deepseek-flash`, and `HSKK_DEEPSEEK_MODEL=deepseek-flash`. The application disables thinking for rubric-based JSON grading, limits feedback list sizes and output tokens, and records token/cache usage in server logs. See `DEEPSEEK_SETUP.md` for the full environment-variable set.

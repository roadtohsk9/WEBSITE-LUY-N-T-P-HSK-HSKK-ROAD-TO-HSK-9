# DeepSeek AI setup – token-efficient configuration

This build uses DeepSeek server-side for Writing, transcript-based Speaking and HSKK transcript assessment. API keys must stay in the hosting environment and must never be placed in browser code or committed to Git.

## Render Environment

Recommended economical defaults:

- `DEEPSEEK_API_KEY` = your private API key
- `DEEPSEEK_MODEL` = `deepseek-flash`
- `DEEPSEEK_VISION_MODEL` = `deepseek-flash`
- `HSKK_DEEPSEEK_MODEL` = `deepseek-flash`
- `DEEPSEEK_WRITING_MAX_TOKENS` = `8000`
- `DEEPSEEK_SPEAKING_MAX_TOKENS` = `5200`
- `DEEPSEEK_REPAIR_MAX_TOKENS` = `4500`
- `HSKK_DEEPSEEK_MAX_TOKENS` = `4200`
- `DEEPSEEK_TIMEOUT_MS` = `120000`
- `HSKK_AI_TIMEOUT_MS` = `240000`

The source disables thinking mode for structured grading calls, uses concise JSON feedback limits, avoids sending duplicate HSKK exam metadata/transcripts, and logs input/output/cache token counts server-side. DeepSeek context caching is automatic; stable grading instructions are placed before each student's changing answer data to improve cache-prefix reuse.

## Audio and token billing are different

HSKK audio recognition is billed by audio duration, not by chat-model text tokens. The transcript evaluation step is token-billed. Shorter but complete recordings reduce ASR audio time; concise transcripts and bounded feedback reduce text-model tokens. Do not truncate a student's valid answer only to reduce model tokens.

## Deployment

1. Update the Environment Variables in Render. In particular, change an old `HSKK_DEEPSEEK_MODEL=deepseek-v4-pro` setting to `deepseek-flash`; an existing Render variable takes precedence over source defaults.
2. Redeploy/restart the service.
3. Inspect Render logs for `[DEEPSEEK_TOKEN_USAGE]` and `[DEEPSEEK_HSKK_USAGE]`. These report token counts and cache hits without exposing the API key or learner content.
4. Run one short Writing/Speaking test and one short HSKK test to verify output quality before using the configuration for all learners.

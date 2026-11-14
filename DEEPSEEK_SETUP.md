# EIT IELTS — DeepSeek AI setup

This build uses DeepSeek server-side for IELTS Writing and transcript-based Speaking grading.

## Required environment variables

Set these in VibeHost (or your Node hosting provider) under Environment Variables:

- `DEEPSEEK_API_KEY` = your DeepSeek API key
- `DEEPSEEK_MODEL` = `deepseek-v4-flash`
- `DEEPSEEK_VISION_MODEL` = `deepseek-v4-flash-vision-exp`
- `DEEPSEEK_TIMEOUT_MS` = `120000`

Do **not** put the real API key in HTML/JS or commit it to Git. The browser calls only `/api/ai/status` and `/api/submit`; the server calls DeepSeek.

## Speaking limitation

DeepSeek's current API path used by this build is text/image based, not raw-audio based. The browser therefore captures an English transcript with Web Speech API while recording and DeepSeek grades that transcript. Pronunciation is shown as a clearly labelled provisional proxy, not a true acoustic pronunciation score. Chrome/Edge are recommended for the transcript capture.

## Deployment

1. Add the environment variables above.
2. Redeploy/restart the Node server.
3. Open `/api/ai/status` while logged in; it should report `configured: true` and `model: deepseek-v4-flash`.

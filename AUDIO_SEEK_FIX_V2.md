# EIT Audio Seek Fix V2

## What changed

1. The server now serves byte-range requests for static assets, including `/uploads/*.mp3`, `.wav`, `.m4a` and `.ogg` files. It answers valid `Range: bytes=...` requests with `206 Partial Content`, `Content-Range`, `Accept-Ranges: bytes`, and a matching `Content-Length`.
2. The player shows one seek timeline rather than two similar bars.
3. The timeline is enabled when the browser has read a finite duration. Dragging the slider changes `audio.currentTime`; seek-back and seek-forward also operate on the same media timeline.
4. Audio-load errors now include a more useful category (network/URL, decode, unsupported source).

## Deploy steps

1. Replace the website code with this ZIP and redeploy/restart the server. The `server.js` change is required for seeking; replacing only the HTML/CSS is not enough.
2. Open an existing Listening test in Admin and click the audio URL (or Open audio) to verify it loads directly in a browser tab. If it returns 404, re-upload the audio after deployment and click **Lưu audio vào đề**.
3. Return to the learner page and refresh without cache (`Ctrl+F5`). Wait until the total duration appears, then drag the blue timeline thumb. The −10s/+10s buttons should also work once duration metadata is available.

Audio timeline controls need a real file URL and valid metadata; no player can seek while the source is unavailable or the duration is unknown.

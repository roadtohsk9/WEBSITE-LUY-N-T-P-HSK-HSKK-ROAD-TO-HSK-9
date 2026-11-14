# V20

- Public navbar auth state is idempotent: exactly one greeting + one logout control.
- Reading divider has a 22px hit target and pointer/mouse fallback.
- Reading now exposes top Passage 1/2/3 tabs plus bottom navigation.
- Reading/Listening completion keeps inline numbered blanks.
- Admin MCQ and Multiple Select now use individual option rows; Multi-select has checkboxes for correct answers.
- Legacy groups infer Reading Passage / Listening Section from question ranges when metadata is missing.
- Admin image/audio file inputs auto-upload on selection; preview URLs cache-bust.
- Multipart upload resolves only after the write stream finishes.

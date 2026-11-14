# CHANGELOG V44

## Scope
Only Reading/Listening VOL and Practice Test flow was changed. Test Centre files were intentionally left untouched.

## Summary / Completion fix
- Snapshot live Summary/Completion inputs before any Passage/Section DOM replacement.
- Persist every text/select/radio/checkbox change immediately.
- Capture active answers again immediately before submission.
- Persist on pagehide to protect against navigation/reload.
- Use the same `answers[number]` source for nav progress and submitted result rows.

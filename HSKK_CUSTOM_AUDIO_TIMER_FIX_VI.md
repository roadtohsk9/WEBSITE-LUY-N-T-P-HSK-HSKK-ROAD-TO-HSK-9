# HSKK CUSTOM ADMIN + AUDIO UPLOAD + PREP TIMER FIX

## Changes
- Added a dedicated "Tạo đề HSKK cao cấp tùy chỉnh" action in Admin. It creates an HSKK 2.0 Advanced draft that can be changed freely.
- Preserved free editing: add/remove sections, add/remove questions, switch supported question types, edit per-question prep/answer seconds, and attach a separate audio file to each question.
- Reworked each question's audio uploader with a dedicated authenticated endpoint, upload progress, clear errors, file validation, and an in-admin audio preview.
- Supported MP3, WAV, M4A, OGG, WEBM, AAC, FLAC, and OPUS uploads, up to 80 MB per HSKK audio file.
- Added optional `UPLOAD_DIR` so uploaded media can be stored on a Render Persistent Disk; `/uploads/...` URLs continue to work when the directory is external.
- Fixed the test timer: the prep countdown begins on the audio element's actual `play` event, not after audio ends. Answer recording starts only after both audio playback has ended and the prep countdown has reached zero. For tasks without audio, prep starts when the question appears.
- Updated the HSKK setup instructions.

## Deployment notes
- Replace the project files with this ZIP and redeploy.
- Keep existing environment variables.
- For persistent uploaded assets on Render, attach a disk (example mount path `/var/data`) and set `UPLOAD_DIR=/var/data/uploads`.
- Check the audio in the Admin preview after upload before publishing the paper.

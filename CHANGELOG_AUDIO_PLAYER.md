# Audio Player Update

- Added reusable custom file-audio controls for HSK Exam and Practice Test pages.
- Added skip-back and skip-forward buttons with a fixed 10-second step.
- Added seek slider, playback speed, volume and mute controls.
- Removed automatic playback on the legacy Listening page.
- Kept Admin's existing audio upload workflow.
- Fixed the media server to support HTTP byte-range requests (206 Partial Content, Content-Range and Accept-Ranges), which are required by browsers for reliable seeking in uploaded audio files.
- Simplified the player to one visible seek timeline with current and total time labels; removed the duplicate timeline that was confusing and easy to mistake for the primary control.
- The seek slider becomes enabled as soon as finite audio duration metadata is available instead of additionally requiring `audio.seekable.length` to be non-zero.
- Added clearer media error messages and forced a metadata reload when the player mounts an audio source.

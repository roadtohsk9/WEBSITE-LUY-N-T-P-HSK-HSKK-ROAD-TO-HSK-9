# EIT IELTS V39 — Dictionary Link Fix

## Dictionary / Personalization
- Fixed the in-app dictionary fallback so a failed dictionary API request no longer leaves the user stuck.
- Added direct Cambridge Dictionary and Google Translate actions beside the search field.
- Added fallback buttons that open Cambridge Dictionary or Google Translate using the exact entered word/phrase.
- Cambridge URLs now normalize spaces to hyphens for better dictionary routing.
- Added a 7-second timeout to the lightweight dictionary API request.
- Kept existing “save to Vocabulary” functionality when the in-app definition service responds successfully.

Updated areas:
- `js/personalization.js`
- `js/practice-test.js`
- `js/practice-result.js`
- `js/personalization-page.js`
- `css/personalization.css`

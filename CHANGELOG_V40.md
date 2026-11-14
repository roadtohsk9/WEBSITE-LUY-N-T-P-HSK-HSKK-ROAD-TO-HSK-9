# EIT IELTS V40 — Free Dictionary API

- Switched dictionary lookup to the free Dictionary API (`dictionaryapi.dev`) with no API key required.
- Added pronunciation audio when available.
- Added synonyms and antonyms returned by the API.
- Reused a shared dictionary renderer across Practice Test, Answer Review and Personalization.
- Kept direct Cambridge Dictionary and Google Translate links as fallback/external reference.
- Added safer timeout/error handling so lookup never hangs indefinitely.

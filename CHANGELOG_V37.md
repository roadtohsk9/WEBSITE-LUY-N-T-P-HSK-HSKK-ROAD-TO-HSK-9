# EIT IELTS V37 — Summary + AI Feedback + Personalization

## Fixed
- Reading and Listening Summary/Completion answers are collected from actual form controls at submit time, avoiding `Not answered` caused by non-input `[data-q]` nodes.
- Answered navigation state now treats trimmed text and checkbox selections consistently.

## AI Writing Feedback
- Added paragraph-by-paragraph analysis to the DeepSeek Writing schema.
- Each paragraph can show exact grammar issue location, original wording, correction, rule and explanation.
- Added separate vocabulary/collocation and coherence notes per paragraph.

## Personalization
- Added `personalization.html` with history + tabs for Vocabulary, Collocations, Synonyms, Antonyms and Structures.
- Reading/Listening practice header now exposes Dictionary and Personalization.
- Answer Review and Detailed Explanation pages include an inline dictionary/personalization panel and quick-save controls.
- Dictionary uses Dictionary API for definitions, with direct Google Translate and Cambridge Dictionary links.
- Completed Reading/Listening practice submissions are stored locally as learning history and linked to saved vocabulary items.

## UI
- Reduced homepage top navigation density and added the Personalization entry.
- Added responsive styling for the new learning panels and paragraph feedback cards.

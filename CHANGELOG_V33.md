# EIT IELTS V33 — Reading Navigation & Resizer Fix

## Reading exam UI
- Kept the IELTS-style bottom navigator: active Passage shows its question numbers; inactive Passages show completion counts.
- Passage 1 / 2 / 3 navigation remains available at the bottom.
- Question buttons now carry their passage number so clicking a question from the current navigator can switch to the correct passage before scrolling to the question.
- Answered question buttons retain the answered state.

## Reading split-pane divider
- Reworked the Passage / Questions divider to use a larger 28px hit area.
- Added visible `↔` drag handle.
- Added robust Pointer Events handling with pointer capture.
- Added mouse fallback and double-click reset to 50/50.
- Added keyboard support: ArrowLeft / ArrowRight adjust width, Home = 25%, End = 75%.
- Saved split position in localStorage and reapplied it on window resize.
- Enforced minimum usable widths for both panes.
- Added global resize cursor while dragging.
- Disabled the divider on narrow/mobile layouts where the two-column layout collapses.

## Compatibility
- Updated both dynamic practice Reading and the legacy static Reading implementation for the bottom Passage/question navigator.

# EIT IELTS V21 — Reading Divider Fix

- Fixed Reading resizer by removing the 50%+divider overflow bug at runtime.
- Divider drag now computes exact pixel tracks from usable width (container width minus divider width).
- Runtime grid template uses `!important` through `style.setProperty` so it cannot be overridden by the legacy CSS rule.
- Mouse, Pointer Events, touch/pointer dragging, persistence and double-click reset remain supported.
- Minimum/maximum split remains 25%–75% of usable content width.

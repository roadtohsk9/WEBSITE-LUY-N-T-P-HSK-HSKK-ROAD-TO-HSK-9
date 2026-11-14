# EIT IELTS V29 Final Production Build

Base: V29 stable project + V24 result/reference project.

This build keeps the existing EIT features and only stabilizes the reported issues:
- Reading bottom Passage/question navigation stays viewport-fixed.
- Reading divider is draggable with pointer + mouse fallback, 25–75%, persistent, double-click 50/50.
- No fixed Passage bar is restored at the top.
- Listening/Reading submit buttons are clickable and open a centered confirmation modal.
- Submit failures unlock the action and restart the remaining timer.
- Timers use real wall-clock deadlines and survive tab throttling/reload.
- Reading/Listening practice flow keeps Result → Answer → Explanation.
- Drag & Drop Summary, Completion, Matching Names/Information, reference tables, Highlight/Note, PRO, Admin, PostgreSQL, Payment, Google Login, accounts, scoring and band conversion are preserved.
- Multiple Choice builder provides four A–D options.
- Original EIT logo asset is preserved.

`__SOURCE_ARCHIVE__` contains the two supplied source ZIPs only because the requested final archive is 150MB+.
It is not required by the runtime. For deployment, the archive can be removed before uploading if the hosting provider has a file-size limit.

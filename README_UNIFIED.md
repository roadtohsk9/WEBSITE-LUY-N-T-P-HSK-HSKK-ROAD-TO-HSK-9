# EIT IELTS — Unified PostgreSQL Edition

This package combines the richer EIT V3 question-bank/admin features with the PostgreSQL/account-enabled EIT test centre.

## Deployment
- Node.js start command: `npm start`
- Required environment variable: `DATABASE_URL` (Vibe Host can provide this automatically when PostgreSQL is linked to the website). `POSTGRES_URL` is also accepted as fallback.
- Do not expose database passwords in source code.

## Admin
Open `/admin/` and sign in with the Admin password configured by `ADMIN_PASSWORD` (default for this package: `EIT2026`).

### Nhập đề
The Admin > Nhập đề screen has dedicated editors for:
- Reading: 3 passages + Questions 1–40, passage assignment, question type, options, answer key, explanation.
- Listening: 4 sections + Questions 1–40, section assignment, question type, options, answer key, explanation, MP3 upload.
- Writing: Task 1 and Task 2, prompt, minimum words, optional image URL.
- Speaking: Part 1, Part 2, Part 3, preparation time, speaking limit.

Existing tests can be opened from the Dashboard and edited. Answer keys can also be edited separately in `Đáp án & giải thích`.

## Database tables
The server automatically creates:
- users
- submissions
- results
- practice_tests
- prediction_files
- course_posts

## Notes
Student passwords are stored as scrypt hashes. Candidate sessions are kept in memory and expire after 12 hours; users must log in again after a server restart.

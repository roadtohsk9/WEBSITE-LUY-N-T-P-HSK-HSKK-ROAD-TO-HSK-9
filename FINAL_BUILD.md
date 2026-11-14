# EIT IELTS — FINAL CONSOLIDATED BUILD

This package consolidates the latest EIT IELTS website fixes requested through V26.

## Core exam experience
- Reading: Passage 1/2/3 navigation, split-pane layout, draggable divider, highlight cycle (brown -> pink -> remove), Notes, inline Completion blanks with question numbers, step-by-step result review, explanations, band conversion for 40-question Reading.
- Listening: full-width layout (no split pane), Section 1-4 navigation, inline Completion/Summary/Note/Form/Table blanks with question numbers, Map/Plan/Diagram image support, audio support, highlight cycle (brown -> pink -> remove), 40-question scoring and band conversion.
- Writing: Task 1/Task 2 workflow, image upload support, word count, submit confirmation modal.
- Speaking: Part 1/2/3, recording workflow, submit confirmation modal.

## Admin
- Reading/Listening Question Builder with Question Group and individual-question modes.
- Dynamic question-range management (FROM/TO) with form rendering by type.
- Completion/summary editor with numbered blanks and answer keys.
- Multiple Choice individual options and Multiple Select checkbox answer keys.
- Map/Plan/Diagram uploads and image previews.
- Writing Task 1/2 image uploads and Listening audio uploads.
- Save & Publish flow.
- Candidate submissions and grading.
- Writing/Speaking detailed feedback, criterion scoring and publish-back to the learner account.
- Per-account test access control and PRO skill access control.
- Google-account management, lock/unlock, PRO/course assignment.
- Course management, center management, payment settings and QR upload.

## Public / learner features
- Guest-accessible course registration and PRO purchase; payment does not require login.
- Default/free access: Reading VOL 1, Listening VOL 1, Writing Practice Test 1, Speaking Practice Test 1.
- PRO unlocks selected skills; Admin can control skill-level and individual-test access.
- Prediction is locked unless the learner has an active PRO entitlement or course enrollment.
- Course enrollment can grant PRO entitlement.
- PRO pricing: 2 skills 99,000 VND/month; 3 skills 129,000 VND/month; 4 skills 179,000 VND/month.
- Homepage course/team sections and 4:3 result showcase.

## Payment
- Admin payment configuration for title, QR, bank, account holder, account number and transfer instructions.
- QR fallback asset included at `uploads/eit-payment-qr.png`.

## Deployment
- Node entrypoint: `server.js`
- Start: `npm start`
- PostgreSQL via `DATABASE_URL` / `POSTGRES_URL`.

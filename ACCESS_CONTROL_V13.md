# EIT Access Control V13

- Free access for normal signed-in accounts: Reading VOL 1, Listening VOL 1, Writing Practice Test 1, Speaking Practice Test 1.
- Non-free practice tests require either an enabled PRO skill or an Admin per-test override.
- Admin can enable/disable an individual practice test for an individual student and restore default access.
- PRO entitlements now store the exact enabled skill list (`skill_access`). A 2/3/4-skill plan must have exactly that many skills enabled by Admin.
- Course enrollment continues to grant PRO 4 skills automatically.
- Prediction requires at least one active PRO entitlement or a course enrollment and is protected server-side.
- `/api/me/access` exposes the student's effective access state.

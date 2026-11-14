EIT IELTS - LOGIN FIX

Changes in this build:
1. Login form trims Full name, Registration ID and EITCODE and normalizes IDs to uppercase.
2. Date of birth is sent in the browser's ISO YYYY-MM-DD format and the server explicitly casts it to DATE.
3. Login now handles non-JSON/empty server responses without showing "Unexpected end of JSON input".
4. Continue button shows "Signing in..." while the request is running and is restored after completion.
5. Clear validation is shown when a required field is missing.
6. Existing PostgreSQL authentication remains the source of truth; no credentials are bypassed.
7. Previous Reading highlight persistence and PASSAGE labels are preserved.

PostgreSQL deployment still requires DATABASE_URL (or POSTGRES_URL).

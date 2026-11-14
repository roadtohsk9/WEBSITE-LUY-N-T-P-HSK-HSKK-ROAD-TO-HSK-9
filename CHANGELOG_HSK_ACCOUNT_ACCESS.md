HSK Exam account access update

- Published Reading and Listening tests are automatically available to every authenticated candidate account.
- No individual per-test permission or PRO entitlement is required for Reading/Listening.
- Requests for an exam test payload still require a valid candidate Bearer token.
- The home page sends the saved candidate token to /api/practice, shows "Xin chào [username]" after login, and offers a login redirect that resumes the selected paper.
- The HSK exam page redirects unauthenticated visitors to login, sends the candidate token to the backend, and displays the candidate username.
- Admin's user access table describes Reading/Listening access as account-wide rather than requiring a manual grant.

Validation performed: Node syntax checks for server.js, js/app.js, and inline scripts in index.html, hsk-exam.html, and admin/index.html. A live PostgreSQL-backed end-to-end login/exam test was not available in this environment.

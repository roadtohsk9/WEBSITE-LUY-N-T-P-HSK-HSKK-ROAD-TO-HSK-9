EIT IELTS - LOGIN FLOW FIX

New behavior:
1. Opening the website/Test Centre does NOT force the user to log in.
2. Clicking Listening, Reading, Writing, or Speaking while logged out opens login.html.
3. The selected exam page is stored as loginRedirect.
4. After successful login, the user is returned directly to the selected exam page.
5. Direct access to exam-reading.html, exam-listening.html, exam-writing.html, or exam-speaking.html while logged out also redirects to login.
6. Existing highlight/passage/title fixes are preserved.

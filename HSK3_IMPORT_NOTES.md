# Imported HSK 3 practice papers

Seed data imports PDFs H31002, H31003, H31004 and H31005 as Reading and Listening only.

- Reading: 30 questions, 30 minutes, divided into 5 question groups (41–45, 46–50, 51–55, 56–60, 61–70).
- Listening: 40 questions, 35 minutes, divided into 4 question groups (1–10, 11–20, 21–30, 31–40).
- Writing questions are intentionally omitted.
- Listening audio is intentionally blank. The exam UI prevents starting a Listening paper until an Admin uploads audio for that test.
- The cropped picture options for Listening questions 1–10 are stored under `hsk-assets/listening/H31002` through `H31005`.

After deployment, open Admin → exam management → choose the relevant HSK 3 Listening test and upload the audio file. The audio upload endpoint updates the audio URL without rewriting the imported questions.

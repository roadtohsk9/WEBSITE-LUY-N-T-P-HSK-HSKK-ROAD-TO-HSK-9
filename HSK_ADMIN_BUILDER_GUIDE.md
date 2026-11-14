# HSK Exam Studio — Admin Builder

## Branding
- The shared `/logo.png` asset has been replaced with a generic HSK Exam Practice mark, so pages using that asset no longer show the previous EIT graphic.
- The Admin login heading is now branded as HSK Admin.

## Creating a new exam
1. Sign in to `/admin/` with the Admin password configured by the owner.
2. Open **Nhập đề** and choose **Reading** or **Listening**.
3. Select HSK 3, 4, 5 or 6.
4. Review the suggested HSK 2.0 blueprint (part labels, question ranges/counts, total questions and duration).
5. Use **Áp dụng cấu trúc này** to reset a new draft to that level's suggested question groups. Existing saved exams are protected from automatic template replacement.
6. Enter passage/section content, group instructions, question prompts, answers and explanations.
7. Images can be attached to a passage/section, an individual question, an answer option, or the overall test cover. Choose a local PNG/JPG/WebP file to upload it through the existing authenticated Admin upload endpoint, or paste an image URL.
8. For Listening, upload audio later and use **Lưu audio vào đề** when editing an existing saved exam. This dedicated action only updates audio metadata and does not rewrite question content.
9. Save and publish the test.

## Traditional HSK 2.0 template values
| Level | Listening | Reading |
|---|---|---|
| HSK 3 | 40 questions · 35 minutes · 4 groups | 30 questions · 30 minutes · 3 groups |
| HSK 4 | 45 questions · 30 minutes · 3 groups | 40 questions · 40 minutes · 3 groups |
| HSK 5 | 45 questions · 30 minutes · 2 groups | 45 questions · 45 minutes · 3 groups |
| HSK 6 | 50 questions · 35 minutes · 3 groups | 50 questions · 50 minutes · 4 groups |

The source PDF supplied for this project is the traditional HSK 3 paper (H31001), so the builder defaults to the corresponding HSK 2.0 six-level test structure. The builder is a template: Admin can change question group ranges and types to match the exact source material used for any custom exam.

## Deployment notes
- Existing backend, account management, question-bank storage, and authenticated upload endpoints are retained.
- Keep the deployment's PostgreSQL `DATABASE_URL` configured as before.
- Verify login, save/publish, uploads and student-side display on the deployed instance after updating the source bundle.

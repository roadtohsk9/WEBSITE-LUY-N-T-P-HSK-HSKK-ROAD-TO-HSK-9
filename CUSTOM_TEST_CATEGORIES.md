# Custom categories for the HSK test bank

## What changed

- Admin now has a **Đề mục kho đề** tab for creating, renaming, and deleting custom categories.
- The original public filters **Cả hai kỹ năng**, **Reading**, and **Listening** remain available. Custom categories appear underneath them in a separate **Đề mục tùy chỉnh** group.
- Each test can be assigned to one custom category in **HSK Exam Studio** or when importing a DOCX/TXT file.
- Published tests show the category label and can be filtered by that category on the home page.
- Category names are stored in PostgreSQL. The server creates the new table and the optional `practice_tests.category_id` column automatically during startup; no manual SQL migration is required.

## How to use

1. Deploy this updated project and restart the server so `initDB()` can create the category table/column.
2. Sign in to Admin and open **Đề mục kho đề**. Enter a name such as `Luyện đọc theo chủ đề` or `Bộ đề nâng cao`, then press **TẠO ĐỀ MỤC**.
3. Open **Nhập đề** (HSK Exam Studio) or **Nhập tài liệu**, then choose the new category before saving/importing a test.
4. On the student home page, choose the relevant HSK level and select the custom category from the filter.

## Notes

- One test can be assigned to one custom category at a time.
- Renaming a category does not detach tests already assigned to it.
- Deleting a category keeps all tests but clears their category assignment. Existing Reading/Listening filters continue to work as before.

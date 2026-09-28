# Expense receipts

Employees can attach one optional PDF, JPG, PNG, or WebP receipt (maximum 4 MB) when submitting an expense. The form accepts decimal amounts, shows the selected filename, supports removing the selection, and prevents duplicate clicks while uploading. Failed submissions keep the form open with an error.

Employee history and manager/admin expense review show **View receipt** for uploaded proof. Opening it requests a fresh, five-minute signed URL and displays the image or PDF with a link to open it in a new tab.

PDFs render in the application with PDF.js, including page navigation, so the preview does not depend on an embedded browser PDF plugin. The `predev` and `prebuild` scripts copy the installed PDF.js worker, fonts, character maps, and WASM assets into the ignored `public/pdfjs/<version>` directory. Deploy the generated public assets with the application.

## Database activation

Apply `supabase/migrations/202609110001_expense_receipts.sql` before releasing the new upload UI. It creates the private `expense-receipts` bucket and policies; it does not require new columns. The existing `expenses.receipt_url` stores the private object path. The migration also prevents replacing a submitted receipt or attaching a different employee's proof via a direct database client.

The migration was applied to the connected Supabase project (`lespxxumxpiqxuekrcoo`) on 11 September 2026 after the user's explicit approval. A read-only verification confirmed `public = false`, a 4,194,304-byte limit, the four allowed MIME types, all three authenticated storage policies, and the `expenses_guard_receipt` trigger. The guard function uses the caller's privileges (not SECURITY DEFINER). Application code changes are local; no hosted web application release was performed.

Existing expenses without attachments remain valid. Previously stored arbitrary external receipt URLs are not embedded by the new viewer. New submissions should attach a file rather than send a URL.

## Access and failure handling

- Files are limited by both API validation and bucket size/MIME restrictions. The API also checks the file signature.
- The uploader can read their own uploads; reviewers require expense approval permission plus team/global scope. The application checks this separately from expense-row RLS, because the live database also contains older, broader expense policies.
- Signed URLs are issued only after an expense-specific authorization check. Responses are not cached.
- Uploads are not public. There is no authenticated file-overwrite policy, and cleanup deletion only allows the uploader's unreferenced objects.
- If database insertion fails after a successful upload, the API attempts to remove the unlinked object. Network failures can still leave an orphan; no automatic retention job is added by this change.
- The feature currently supports one proof file at creation, not adding/replacing attachments on existing submissions.

## Verification completed

- Seven focused tests cover MIME/size/signature validation, multipart submission, submissions without receipts, failed-upload/database cleanup, and employee/team/global receipt authorization.
- All 230 web tests pass.
- Production build passes.
- Targeted lint has no errors; three pre-existing manager image warnings remain.
- Live receipt storage migration succeeded and its deployed configuration was verified.
- A signed-in employee submitted a PDF and PNG against the connected database from the local production application. Both attachments persisted after reload and displayed correctly. The PDF test exposed a blank embedded-browser preview; the PDF.js viewer fixed it, and both previews were checked again after a successful production build and test run.
- An unsupported text file was rejected in the form before submission.
- Two pending QA expenses of INR 0.01 each remain in the database with descriptions identifying them as TEST ONLY - NOT REIMBURSABLE (PDF/PNG receipt upload QA 2026-09-12). They represent no purchase and must not be approved. Their attached synthetic receipts remain stored.

## Verify after activation

1. Repeat PDF and image upload/preview checks after deploying the hosted application; the authenticated local production checks are complete.
2. Verify an ordinary expense without proof still succeeds.
3. Verify the assigned reviewer can open proof, and an unrelated employee or out-of-team reviewer cannot.
4. Confirm the bucket is private, signed links expire, and direct file overwrite/deletion of submitted proof is rejected.
5. Check failed insertion cleanup using a disposable test environment.

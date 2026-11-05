---
description: Draft the letter to the referring doctor after a consultation or operation, in drafts/.
---

1. Run `npm run rooms -- letters --json` and `npm run rooms -- show "<patient>" --json`.
2. Render the letterhead and details with `npm run docs -- referrer-letter`.
3. Write `drafts/<YYYY-MM-DD>-<letter code>.md`: Dear Dr <referrer>, thank you for referring <patient>. Then the doctor's findings and plan, taken only from the clinical notes, results and procedures on file. Where the notes are thin, leave `[doctor to dictate]` rather than writing clinical content.
4. Tell the operator the doctor signs it off, then `letter-sent` records it.

Nothing sends.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

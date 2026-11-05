---
description: The Monday review for the practice manager, written from attention, procedures and letters into drafts/.
---

1. Run `npm run rooms -- attention --json`, `npm run rooms -- procedures --days=21 --json`, `npm run rooms -- letters --json` and `npm run rooms -- compliance --json`.
2. Write `drafts/<YYYY-MM-DD>-weekly-review.md` with four sections: **Must happen this week** (unsigned estimates, expired referrals for booked patients, abnormal results, missing provider numbers), **Theatre in the next three weeks** (each procedure, hospital, consent, hospital booking), **Letters and results** (by doctor), **Compliance** (the table in one line per rule).
3. Each line names the patient, the doctor and the date. Numbers in tables. No adjectives.
4. Run `npm run view -- week` and say where the HTML is.

Nothing sends. The review is for the practice to read.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

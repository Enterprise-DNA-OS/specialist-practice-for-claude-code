---
description: Draft a short request to a patient's GP for a new referral before a booked visit, in drafts/.
---

1. Run `npm run rooms -- referrals --expiring=30 --json` and `npm run rooms -- show "<patient>" --json`.
2. Write `drafts/<YYYY-MM-DD>-<patient code>-referral-request.md` to the GP on file: the patient, the specialist, the condition being managed, when the current referral ended, the next appointment date, and the request for a new referral (indefinite if the condition needs ongoing care). One paragraph. Use the GP's preferred channel from the referrer record.

Nothing sends.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

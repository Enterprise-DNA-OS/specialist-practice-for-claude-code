---
description: A polite reminder about an overdue account, in drafts/.
---

1. Run `npm run rooms -- debtors --json` and `npm run rooms -- show "<patient>" --json`.
2. Render the statement with `npm run docs -- patient-statement`.
3. Write `drafts/<YYYY-MM-DD>-<account>-reminder.md`: the account, the date of the visit or procedure, what is owing and how to pay. For a health fund, insurer or workers compensation payer, write to the claims contact with the claim number instead. One paragraph. No threat of collection unless the operator asks.

Nothing sends.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

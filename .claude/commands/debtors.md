---
description: Open accounts by age and payer, payments and write-offs.
---

```sh
npm run rooms -- debtors
npm run rooms -- debtors --payer=workers_comp
npm run rooms -- invoice "Tane Walker" --amount=210 --appointment=AP-3120 --by="Mia Torres"
npm run rooms -- pay INV-6001 --amount=146 --by="Mia Torres"
npm run rooms -- pay INV-6002 --write-off --reason="Insurer declined" --by="Mia Torres"
```

Total by bucket (0-30, 31-60, 61-90, 90+), then the list oldest first. Statements: `npm run docs -- patient-statement`. Offer `/draft-account-reminder` for anything over 60 days.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

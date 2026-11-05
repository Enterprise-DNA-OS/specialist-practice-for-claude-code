---
description: Letters owed to referring doctors, most overdue first, and marking them sent.
---

```sh
npm run rooms -- letters
npm run rooms -- letter-sent LT-5003 --by="Mia Torres"
```

Group by doctor so each can clear their own. Say how each referrer prefers to receive letters (secure message, email, fax, post). Offer `/draft-letter` for any not yet dictated.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

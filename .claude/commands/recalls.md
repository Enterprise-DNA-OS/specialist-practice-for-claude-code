---
description: Recalls due or overdue, and whether the patient has anything booked.
---

```sh
npm run rooms -- recalls --days=30
npm run rooms -- recall "Tane Walker" --with=menon --due=+42d --reason="Six week review" --by="Mia Torres"
npm run rooms -- recall "Tane Walker" --done --by="Mia Torres"
```

Lead with overdue recalls that have nothing booked. Offer `/book` for each.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

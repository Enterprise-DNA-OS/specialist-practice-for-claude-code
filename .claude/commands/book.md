---
description: Book an appointment, checking the time is free and the referral covers it.
---

```sh
npm run rooms -- book "Tane Walker" --with=menon --at=2026-11-20 --time=11:00 --location=RM --kind=initial --by="Mia Torres"
```

Kinds: initial, review, pre_op, post_op, procedure, telehealth. The CLI refuses a clash (pass `--double` only when the doctor agrees) and reports the referral cover. If it says `expired` or `no referral`, tell the operator and offer `/draft-referral-request`.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

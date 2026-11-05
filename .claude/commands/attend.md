---
description: Close an appointment as attended, did not attend or cancelled, with the item and fee. An initial or pre-op visit opens the letter owed to the referrer.
---

```sh
npm run rooms -- attend AP-3108 --item=105 --fee=180 --by="Mia Torres"
npm run rooms -- attend AP-3101 --status=dna --by="Mia Torres"
npm run rooms -- attend AP-3110 --letter --by="Mia Torres"   # a review that needs a letter too
```

The first attended visit on a referral starts its validity clock. Say which letter is now owed and when it is due.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

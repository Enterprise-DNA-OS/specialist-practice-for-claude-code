---
description: The procedure list: who, where, the estimated gap, whether consent is signed and the hospital booked. Plus the waitlist.
---

```sh
npm run rooms -- procedures --days=60
npm run rooms -- waitlist
npm run rooms -- plan "Tane Walker" --surgeon=menon --hospital=NDS --procedure="Trigger finger release" --fee=1200 --rebate=400 --date=+45d --by="Mia Torres"
npm run rooms -- schedule PX-4004 --status=booked --hospital-booked --by="Mia Torres"
```

A procedure cannot move to booked without a signed fee estimate on file; the CLI refuses unless `--override --reason` is given, and the override is audited. Show the waitlist with days waited, longest first within each urgency.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

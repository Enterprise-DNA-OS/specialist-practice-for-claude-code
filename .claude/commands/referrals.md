---
description: Referrals running out, new ones to triage, and which booked patients need a fresh referral.
---

```sh
npm run rooms -- referrals --expiring=60
npm run rooms -- referrals --new
npm run rooms -- triage REF-2012 --urgency=soon --by="Mia Torres"
npm run rooms -- add-referral "Margaret Ellis" --from=GP-01 --to=chen --issued=2026-11-03 --by="Mia Torres"
```

A GP referral lasts 12 months from the first consultation, a specialist referral 3 months, unless the referral says otherwise (`--months`, `--indefinite`). Only GP and specialist referrals count for Medicare: decline or file allied health letters as information. Sort the new list by urgency and say how long each has waited.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

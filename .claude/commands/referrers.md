---
description: Who sends us new patients: the last 12 months against the 12 before, and who has gone quiet.
---

```sh
npm run rooms -- referrers
npm run rooms -- referrers --quiet
npm run rooms -- log --referrer=galloway --kind=visit --summary="Lunch with the practice" --by="Mia Torres"
```

Say which referrers are growing, which are falling, and who has sent nothing in the quiet window (`quiet_referrer_days` in the policy table). For a quiet referrer, check `letters`: a late letter is often why. Offer to log a visit or call.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

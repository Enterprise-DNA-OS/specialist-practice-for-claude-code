---
description: The clinic list for a day, with whether each patient's referral covers the visit.
---

```sh
npm run rooms -- day                         # today
npm run rooms -- day --date=+1d --practitioner=chen
npm run rooms -- upcoming --days=14
```

Show the list by doctor and time. Flag every row whose referral is `expired`, `expiring` or `no referral`: those patients need a new referral from their GP before they are seen, or the visit cannot be billed to Medicare. Offer `/draft-referral-request` for each.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

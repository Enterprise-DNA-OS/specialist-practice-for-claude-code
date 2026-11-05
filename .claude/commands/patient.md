---
description: One patient on one page: referrals and when they run out, bookings, procedures and consent, letters, results, recalls, accounts and the latest notes.
---

```sh
npm run rooms -- show "Margaret Ellis"
```

Summarise in three lines first: who they are, what is happening next, and anything out of order (an expired referral, an unsigned estimate, a letter not sent, a result not reviewed, money owing). Then the tables.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

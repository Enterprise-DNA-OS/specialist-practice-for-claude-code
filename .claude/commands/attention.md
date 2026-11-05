---
description: Everything that needs the front desk or a doctor this week, worst first: procedures without signed consent, expired referrals, abnormal results, missing provider numbers, overdue letters, registrations, recalls and old accounts.
---

```sh
npm run rooms -- attention                    # the whole practice
npm run rooms -- attention --practitioner=menon
```

Present it as one table grouped by severity. Lead with the three-mark items (consent, expired referral, abnormal result, provider number). For each, add one line on the next action and the command that records it (`consent`, `add-referral`, `review-result`, `provider-number`, `letter-sent`, `recall`). Finish with a count per issue.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

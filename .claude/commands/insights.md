---
description: The ten questions Gentu's reports never answered, run against the practice.
---

Run each and present one line of answer per question, then the table:

1. Which referrers sent the most new patients this year, and who has gone quiet? `referrers`, `referrers --quiet`
2. Which patients booked in the next 30 days arrive on a referral that has run out? `referrals --expiring=30`
3. Which procedures in the next three weeks have no signed fee estimate? `consents`
4. Which letters to referring doctors are late, and by how long? `letters`
5. Which results have waited longest for a doctor? `results`
6. What share of new patients go on to a procedure, by surgeon? `conversion`
7. Who missed appointments, and do they have another booked? `dna`
8. How much is owed, by age and payer? `debtors`
9. Is any practitioner working from a location without a provider number? `providers`
10. Who is overdue for a recall and has nothing booked? `recalls`

All are `npm run rooms -- <command>`.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

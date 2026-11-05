---
description: Add a patient or a referring doctor.
---

```sh
npm run rooms -- add-patient --name="Olivia Grant" --born=12/05/1984 --fund=HCF --fund-ref=HCF-77120 --medicare --gp=liu --phone="0400 300 001" --by="Mia Torres"
npm run rooms -- add-referrer --name="Dr Ben Ashworth" --practice="Neutral Bay Medical" --suburb="Neutral Bay" --provider=1122337G --prefers=email --by="Mia Torres"
```

Check `patients --all` for the name first so nobody is added twice. Dates of birth take DD/MM/YYYY or YYYY-MM-DD.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

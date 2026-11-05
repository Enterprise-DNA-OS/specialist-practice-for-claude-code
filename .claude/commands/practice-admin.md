---
description: Provider numbers, registration and indemnity dates, and record retention.
---

```sh
npm run rooms -- providers
npm run rooms -- provider-number --practitioner=menon --location=PR --number=3456783C --opened=2026-09-01 --by="Mia Torres"
npm run rooms -- provider-number --practitioner=chen --location=TEL --close --by="Mia Torres"
npm run rooms -- registrations
npm run rooms -- renew Menon --indemnity=2027-12-10 --by="Mia Torres"
npm run rooms -- retention
npm run rooms -- dispose PT-1009 --on=2028-11-05 --by="Mia Torres"
```

A practitioner needs a provider number for each location they work from. Registration for medical practitioners renews by 30 September each year. `dispose` refuses any date inside the retention period; it only records the date, it never deletes.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

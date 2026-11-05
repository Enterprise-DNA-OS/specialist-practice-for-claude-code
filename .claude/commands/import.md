---
description: Bring patients and appointments across from Gentu report exports. Dry run first.
---

Follow `docs/replace-gentu.md`.

```sh
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --dry-run --by="Mia Torres"
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --by="Mia Torres"
```

Always run the dry run first and show the counts and every skipped row. If a column the import needs has a different header in their export, map it: rename the header in a copy of the file, or add the name to the `pick` list in `scripts/rooms.mjs`. The import is repeatable: rows already brought across (matched on the Gentu id) are left alone. After a real import run `patients`, `upcoming` and `referrals` and ask the operator for referrals, procedures and recalls, which the patient and appointment reports do not carry.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

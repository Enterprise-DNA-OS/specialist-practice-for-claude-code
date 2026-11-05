---
description: Write every table to CSV files you can open anywhere.
---

```sh
npm run rooms -- export
npm run rooms -- export --out=exports/year-end
```

Say where the files are and how many rows each holds. Patient data: remind the operator to keep the folder somewhere private.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

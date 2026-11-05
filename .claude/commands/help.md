---
description: Every CLI command and what it does.
---

```sh
npm run rooms -- help
```

Show the list, then the five slash commands most people start with: `/attention`, `/day`, `/patient`, `/consents`, `/weekly-review`.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

---
description: Procedures still waiting on a signed fee estimate, soonest first, and recording the estimate sent or signed.
---

```sh
npm run rooms -- consents
npm run docs -- fee-estimate
npm run rooms -- consent PX-4001 --given --by="Mia Torres"
npm run rooms -- consent PX-4001 --signed --on=2026-11-06 --by="Mia Torres"
```

For each unsigned estimate say the days to surgery and the estimated gap. Render the estimate with `npm run docs -- fee-estimate` and say where the file is. The patient gets it and signs; you record it. Never mark one signed on the operator's guess.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

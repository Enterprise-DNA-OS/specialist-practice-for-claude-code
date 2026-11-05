---
description: Log a call, email, SMS or visit with a patient or a referring practice, or add a clinical note.
---

```sh
npm run rooms -- log "Priya Sharma" --kind=call --summary="Rang to confirm Parramatta review" --by="Mia Torres"
npm run rooms -- log --referrer=GP-04 --kind=visit --summary="Dropped in with new rooms details" --by="Mia Torres"
npm run rooms -- note "Tane Walker" --doctor=menon --text="Nodule at A1 pulley. Injected." --by="Dr Rajiv Menon"
```

Turn the operator's words into one sentence for a log entry. A clinical note is the doctor's own words, recorded as given.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

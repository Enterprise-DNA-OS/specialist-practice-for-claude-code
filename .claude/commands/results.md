---
description: Results no doctor has reviewed, abnormal first, and recording the review.
---

```sh
npm run rooms -- results
npm run rooms -- add-result "Tane Walker" --test="Ultrasound right hand" --doctor=menon --abnormal --by="Kate Brennan"
npm run rooms -- review-result Papadopoulos --action="Iron infusion before surgery" --by="Dr Amelia Chen"
```

Only a doctor reviews a result. If the operator is not a doctor, show the list and say who it is waiting on. Never write an action the doctor did not give.

Writes need `--by="<operator name>"`; it goes in the audit log. Say back what you are about to record in one line before running it, and show the result after. Never delete a record: close, cancel or mark it instead.

Every command takes `--json`. Patients match on code, id prefix or part of the name; if the CLI lists several candidates, show them and ask which one. Never answer about a patient from memory.

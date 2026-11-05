# Compliance rules these rooms check

`npm run rooms -- compliance` checks the records against the rules below. Each rule says where it comes from, what a breach looks like in the data, and which check finds it. The periods live in the `policy` table, so a practice in another state, or in New Zealand, changes a number, not the code.

This is not legal or billing advice. Confirm which rules apply to your practice, then keep this page and the checks in step. If a rule here is out of date, say so and stop: `/compliance` will not guess at law.

## Medicare (Australia)

| # | Rule | What the source says | Breach in the data | Check |
|---|---|---|---|---|
| 1 | A valid referral for every specialist consultation billed to Medicare | Services Australia, *Referrals for specialist treatment* (servicesaustralia.gov.au/referrals-for-specialist-treatment): a GP referral to a specialist is valid for 12 months from the specialist's first consultation unless the referral states another period or "indefinite"; a referral from a specialist or consultant physician is valid for 3 months unless the patient is admitted. | An attended consultation in the last year with an item number, on a day no GP or specialist referral covered. Due: a booking in the next 30 days on a referral that has run out. Allied health letters do not count. | `v_referrals`, `v_referral_cover`, rule 1 |
| 2 | A provider number for each location | Services Australia, *Application for a Medicare provider number for a medical practitioner* (form HW019): "You must apply for a unique provider number for each location and profession you practise in." | A practitioner booked at a location with no provider number open on that day. | `v_provider_gaps`, rule 2 |

Set `referral_months_gp` and `referral_months_specialist` in `policy` only if Services Australia changes the defaults. A referral that says its own period carries it in `referrals.valid_months` or `indefinite`.

## Fees

| # | Rule | Source | Breach in the data | Check |
|---|---|---|---|---|
| 3 | Fees agreed in writing before a procedure | Medical Board of Australia, *Good medical practice: a code of conduct for doctors in Australia*, 4.5.3: patients are told about fees and charges in time to make an informed decision about whether to proceed. The Council of Presidents of Medical Colleges framework (March 2026) calls informed financial consent a professional responsibility of specialists. How many days before is your practice standard: `ifc_days` (14). | A planned or booked procedure inside `ifc_days` with no signed estimate. Due: inside `ifc_days` plus 14. `schedule --status=booked` refuses a procedure with no signed estimate unless overridden with a reason. | `v_procedures`, rule 3 |

## Registration and insurance

| # | Rule | Source | Breach in the data | Check |
|---|---|---|---|---|
| 4 | Registered on the day they practise | Medical Board of Australia, *Registration renewal* (medicalboard.gov.au/Registration/Registration-Renewal.aspx): "The registration renewal date for medical practitioners with general, specialist or non-practising registration is 30 September." A practitioner who does not renew by then or within the one-month late period is removed from the register. Nurses renew with their own board by 31 May. | A practitioner whose `registration_expires_on` has passed. Due: inside `registration_warn_days` (60). | `v_registrations`, rule 4 |
| 5 | Professional indemnity insurance in force | Health Practitioner Regulation National Law, s 129: a registered health practitioner must not practise unless appropriate professional indemnity insurance arrangements are in force. | `indemnity_expires_on` in the past. Due: inside `registration_warn_days`. | `v_registrations`, rule 5 |

## Keeping records

| # | Rule | Source | Breach in the data | Check |
|---|---|---|---|---|
| 6 | Records kept for the retention period | NSW: *Health Records and Information Privacy Act 2002*, s 25: a private health service provider keeps an adult's health information for 7 years from the last service, and information collected while the patient was under 18 until they turn 25. Victoria and the ACT set the same periods. New Zealand: *Health (Retention of Health Information) Regulations 1996*, regs 5 and 6: 10 years from the day after the last service. | A patient record with a disposal date earlier than its keep-until date. `dispose` refuses such a date. | `v_retention`, rule 6 |

For New Zealand set `retention_years_adult` to 10 and `retention_age_minor` to 0.

## Practice standards

These are not law. They are the standards most rooms hold themselves to, and the ones referrers notice.

| # | Rule | Breach in the data | Check |
|---|---|---|---|
| 7 | A letter to the referring doctor within `letter_days` (7) of a consultation or operation | A letter past its due date and not sent. Due: inside the next week. | `v_letters_owed`, rule 7 |
| 8 | Results reviewed by a doctor within `result_days` (3), abnormal ones the next day | An unreviewed result older than `result_days`, or an abnormal one a day old. | `v_results_waiting`, rule 8 |

## Changing a rule

Ask `/customise` in plain words ("our estimates go out 21 days before surgery", "we are in Auckland, keep records 10 years"). It changes the `policy` row, or the check in `scripts/rooms.mjs` and this page together, then runs `npm test`.

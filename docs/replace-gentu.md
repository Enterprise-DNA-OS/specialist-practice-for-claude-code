# Moving off Gentu

Most of the move is two files: a patient list and an appointment list, both exported from Gentu's reports as CSV. Referrals, procedures, recalls and accounts are quicker to bring across by asking Claude Code than to map, because each practice holds them differently.

## 1. Export from Gentu

Gentu's reports can be saved as CSV. Export:

- **Patients**: patient id, first name, last name, date of birth, mobile, email, health fund, health fund number, Medicare number (only to note that one is on file), usual GP.
- **Appointments**: appointment id, patient id, date, start time, duration, practitioner, location, appointment type, status, item number, fee.

Column names depend on the report and the columns you tick. The import accepts the common names (`Patient ID`, `First Name`, `Last Name`, `Date of Birth` or `DOB`, `Mobile`, `Health Fund`, `Usual GP`; `Appointment ID`, `Appointment Date`, `Start Time`, `Practitioner`, `Location`, `Appointment Type`, `Status`, `Item Number`, `Fee`). If yours differ, open the CSV headers and ask Claude Code to add the alias to the `pick(...)` lists in `scripts/rooms.mjs`, then rerun the test.

For everything else, including clinical notes, letters and documents, ask Magentus support for a full export of your practice data before your subscription ends. Magentus also publishes a provider API for Gentu.

Put the files in `imports/` (ignored by git). They hold patient data: keep the folder on the practice's own machine.

## 2. Dry run, then import

```sh
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --dry-run --by="Your Name"
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --by="Your Name"
```

The dry run saves nothing and lists every row it would skip. The real import can be run again safely: rows already here (matched on the Gentu id) are left alone. A third file of referring doctors (`--referrers=`, columns `Name`, `Practice`, `Provider Number`, `Email`) is optional; referrers named as a patient's usual GP are added either way.

## What maps

| Gentu | Here |
|---|---|
| Patient id | `patients.source_ref` (`gentu:<id>`); the patient code becomes `GT-` and the id |
| First and last name, date of birth, mobile, email | `patients.name`, `born_on`, `phone`, `email` |
| Health fund, fund number | `patients.health_fund`, `fund_member_ref` |
| Medicare number | `patients.medicare_on_file` (true or false; the number itself is not stored) |
| Usual GP | `referrers` (added if new), `patients.usual_gp_id` |
| Appointment id | `appointments.source_ref` (`gentu:<id>`) |
| Date and start time, duration | `appointments.starts_at`, `minutes` (DD/MM/YYYY and 9:30am both read) |
| Practitioner, location | `practitioners`, `locations` (added if new) |
| Appointment type | `kind`: new or initial, review, pre-op, post-op, telehealth, procedure |
| Status | `status`: did not arrive or no show becomes `did_not_attend`, cancelled stays cancelled, a past date otherwise `attended`, a future one `booked` |
| Item number, fee | `item_number`, `fee_cents` |

## What does not carry over in these two files

- **Referrals.** Add the current referral for each active patient with `/referrals` (`add-referral`, with the issue date and the first consultation). Without them the referral check reports every upcoming booking as having no referral, which is the list to work through.
- **Procedures, waitlist and fee estimates.** Add each planned procedure with `/procedures` and mark the estimates already signed with `/consents`.
- **Provider numbers, registration and indemnity dates.** Set them once with `/practice-admin`.
- **Clinical notes, letters and scanned documents.** Keep Gentu's full export as the archive for those, or ask Enterprise DNA to bring them across into your version.
- **Online bookings, SMS reminders and claiming.** These run through Gentu's integrations. The free version records the bookings and items; sending reminders and lodging claims stay with the services that do them today.

## Running both for a month

Import, then run `upcoming`, `referrals --expiring=60` and `attention` each morning next to Gentu. When the lists agree for two weeks, stop booking in Gentu and keep it read-only until its export is safely stored.

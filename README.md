<h1 align="center">Specialist Practice for Claude Code</h1>

<p align="center">
  <strong>The open-source specialist rooms system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Gentu data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gentu">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/gentu?utm_source=github&utm_medium=readme&utm_campaign=gentu">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-gentu">Instead of Gentu</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Specialist Practice for Claude Code does the job you pay Gentu for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Gentu dashboard cannot.

Magentus does not publish Gentu's prices: "Gentu pricing is based on the number and role of users within your practice" ([Gentu page](https://www.magentus.com/practice-management/gentu/), checked 5 November 2026), with online bookings, scribes, patient forms and consent management sold as Marketplace add-ons. A practice with several specialists, a nurse and a front desk pays for every one of those users, every month.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gentu).

It is the front office of a specialist medical practice: referrals and the day each one runs out, bookings across rooms, hospitals and telehealth, the procedure list and waitlist, written fee estimates and whether they are signed, letters owed to referring doctors, results waiting for review, recalls, patient accounts, provider numbers by location, registration and indemnity dates, and record retention. It is built for surgical and medical specialist rooms with two to twenty practitioners, and it checks the practice against the Medicare referral rules, the one-provider-number-per-location rule, the Medical Board's fee disclosure standard and the health records retention laws out of the box.

### Ten questions Gentu's reports never answered

Each is one command on the demo practice today.

1. Which GPs sent the most new patients this year, and who has gone quiet? `referrers`, `referrers --quiet`
2. Which patients booked in the next 30 days arrive on a referral that has run out? `referrals --expiring=30`
3. Which procedures in the next three weeks have no signed fee estimate? `consents`
4. Which letters to referring doctors are late, and by how long? `letters`
5. Which results have waited longest for a doctor, abnormal first? `results`
6. What share of new patients go on to a procedure, by surgeon? `conversion`
7. Who missed appointments, and do they have another booked? `dna`
8. How much is owed, by age and by payer? `debtors`
9. Is any doctor working from a location without a provider number? `providers`
10. Who is overdue for a recall and has nothing booked? `recalls`

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/specialist-practice-for-claude-code.git
cd specialist-practice-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. It lists everything on the demo practice that needs someone this week: a hip replacement in ten days with no fee estimate sent, two patients booked on referrals that have run out, an abnormal blood test nobody has looked at, a surgeon consulting at a second location with no provider number, two late letters to GPs and an indemnity policy about to lapse.

From the terminal the same thing is `npm run rooms -- attention`. `npm run view` writes the week, the referrers and the compliance checks as HTML pages; `npm run docs` writes fee estimates, letters to referrers and patient statements in your brand (`brand.json`).

### Your first hour: ten things to ask for

1. "What needs attention this week?"
2. "Who is on Dr Chen's list tomorrow, and is everyone's referral valid?"
3. "Show me Margaret Ellis."
4. "Which procedures still need a signed estimate?"
5. "Write the fee estimate for George Papadopoulos's hip."
6. "Draft a request to Dr Park for a new referral for Margaret Ellis."
7. "Run the compliance check and explain each breach."
8. "Which GPs have gone quiet, and do we owe them letters?"
9. "We send estimates 21 days before surgery, change it." (`/customise`)
10. "Add a field for the patient's preferred hospital." (`/customise`)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/add-patient` | Add a patient or a referring doctor. |
| `/attend` | Close an appointment as attended, did not attend or cancelled, with the item and fee. An initial or pre-op visit opens the letter owed to the referrer. |
| `/attention` | Everything that needs the front desk or a doctor this week, worst first: procedures without signed consent, expired referrals, abnormal results, missing provider numbers, overdue letters, registrations, recalls and old accounts. |
| `/book` | Book an appointment, checking the time is free and the referral covers it. |
| `/compliance` | Check the records against the rules this industry lives under (the ones listed in docs/compliance.md) and report what is missing, late, or about to breach, with the rule cited. |
| `/consents` | Procedures still waiting on a signed fee estimate, soonest first, and recording the estimate sent or signed. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/day` | The clinic list for a day, with whether each patient's referral covers the visit. |
| `/debtors` | Open accounts by age and payer, payments and write-offs. |
| `/draft-account-reminder` | A polite reminder about an overdue account, in drafts/. |
| `/draft-letter` | Draft the letter to the referring doctor after a consultation or operation, in drafts/. |
| `/draft-referral-request` | Draft a short request to a patient's GP for a new referral before a booked visit, in drafts/. |
| `/export` | Write every table to CSV files you can open anywhere. |
| `/help` | Every CLI command and what it does. |
| `/import` | Bring patients and appointments across from Gentu report exports. Dry run first. |
| `/insights` | The ten questions Gentu's reports never answered, run against the practice. |
| `/letters` | Letters owed to referring doctors, most overdue first, and marking them sent. |
| `/log` | Log a call, email, SMS or visit with a patient or a referring practice, or add a clinical note. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/patient` | One patient on one page: referrals and when they run out, bookings, procedures and consent, letters, results, recalls, accounts and the latest notes. |
| `/practice-admin` | Provider numbers, registration and indemnity dates, and record retention. |
| `/procedures` | The procedure list: who, where, the estimated gap, whether consent is signed and the hospital booked. Plus the waitlist. |
| `/recalls` | Recalls due or overdue, and whether the patient has anything booked. |
| `/referrals` | Referrals running out, new ones to triage, and which booked patients need a fresh referral. |
| `/referrers` | Who sends us new patients: the last 12 months against the 12 before, and who has gone quiet. |
| `/results` | Results no doctor has reviewed, abnormal first, and recording the review. |
| `/weekly-review` | The Monday review for the practice manager, written from attention, procedures and letters into drafts/. |

## Instead of Gentu

Export the patient list and the appointment list from Gentu's reports as CSV, then:

```bash
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --dry-run --by="Your Name"
npm run rooms -- import gentu --patients=imports/patients.csv --appointments=imports/appointments.csv --by="Your Name"
```

The dry run saves nothing and lists every row it would skip. Patients, usual GPs, practitioners, locations and appointments come across, with item numbers and fees; referrals, procedures and recalls are set once by asking. The full guide, including what does not carry over, is [docs/replace-gentu.md](docs/replace-gentu.md).

## Architecture

```
specialist-practice-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Specialist Practice for Claude Code for your business, migrates your Gentu data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=gentu)
- Read more: [enterprisedna.co/omni/instead-of/gentu](https://enterprisedna.co/omni/instead-of/gentu?utm_source=github&utm_medium=readme&utm_campaign=gentu)

## License

MIT. Copyright (c) 2026 Enterprise DNA.

# Specialist Practice for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing this week | `/attention` |
| Today's or tomorrow's clinic list, referral cover | `/day` |
| One patient | `/patient` |
| Referrals running out, new referrals, triage | `/referrals` |
| Book an appointment | `/book` |
| Mark attended, did not attend, cancelled | `/attend` |
| The procedure list, waitlist, planning surgery | `/procedures` |
| Fee estimates sent and signed | `/consents` |
| Letters owed to referrers | `/letters` |
| Draft a letter to a referrer | `/draft-letter` |
| Ask a GP for a new referral | `/draft-referral-request` |
| Results waiting for review | `/results` |
| Recalls | `/recalls` |
| Accounts, payments, statements | `/debtors` |
| Remind someone about an account | `/draft-account-reminder` |
| Who refers to us, who has gone quiet | `/referrers` |
| Add a patient or a referring doctor | `/add-patient` |
| Log a call or visit, add a clinical note | `/log` |
| Provider numbers, registration, indemnity, retention | `/practice-admin` |
| Check the rules | `/compliance` |
| The Monday review | `/weekly-review` |
| Questions the old reports never answered | `/insights` |
| Bring data across from Gentu | `/import` |
| Get everything out as CSV | `/export` |
| Change a field, a stage or a rule | `/customise` |
| A new read-only dashboard | `/new-view` |
| Every command | `/help` |

If an ask fits nothing here, run the CLI directly (`npm run rooms -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## House rules for a medical practice

- Patient data stays in this database and this folder. Never paste a patient's details into anything outside it.
- Only a doctor reviews a result or writes clinical content. Draft letters leave `[doctor to dictate]` where the notes are thin.
- Never mark a fee estimate signed, a referral received or a result reviewed on a guess. Ask.
- `dispose` records a date; nothing deletes a patient record.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Gentu.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/gentu

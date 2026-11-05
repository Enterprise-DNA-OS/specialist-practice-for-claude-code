# Why there is no front end

Gentu is a database with a subscription. The records underneath it are ordinary: patients, referrals, appointments, procedures, letters, results, accounts. What you pay for, per user and by role, is the layer on top that lets reception, nurses and doctors get at those records without writing queries. Screens, an appointment book, forms, reports.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, ask "who is booked tomorrow on a referral that has run out?", and it runs the query and answers. Ask a question the reports never had, like which GPs have stopped referring since their letters started running late, and you still get an answer.

## What you gain

- **Better answers.** A report shows what the vendor decided to build. Here you ask your own question about your own practice.
- **No seats.** Every doctor, nurse and receptionist can look. The bill does not grow with the team.
- **Your data in your database.** Plain records you own. Back them up, read them from anything, leave any time.
- **Rules that match your rooms.** Your consent window, your letter standard, your retention period are numbers you change in one sentence.

## What you give up

- **An appointment book on screen.** Bookings are a list you ask for, not a calendar you drag. Reception that books all day may want a screen, and that is a customisation.
- **Online booking, SMS reminders, e-prescribing and Medicare claiming.** Those need connections to outside services. The free version records the appointment and the item; it does not send, prescribe or lodge.
- **A phone app.** It runs where Claude Code runs.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for practices that want someone to call.

## Who this fits

Practice managers and specialists who want the answers more than the screens: which referrals are running out, which estimates are unsigned, which letters are late, who is owed what. If your reception needs a booking screen all day, keep it, or have Enterprise DNA build one over this same database.

Installed and run for you: https://enterprisedna.co/omni/instead-of/gentu

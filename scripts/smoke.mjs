#!/usr/bin/env node
// npm test: a temporary database, migrate, seed twice, then every command, every write rule and the import.
// Set TEST_DATABASE_URL to run the same checks against an empty, disposable Postgres.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = mkdtempSync(path.join(os.tmpdir(), 'specialist-practice-'));
process.env.DATA_DIR = path.join(temp, 'db');
process.env.OUTPUT_DIR = temp;
// Blank on purpose: stops .env or .env.local loading a live connection into the test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';

const { getDb, REPO_ROOT } = await import('./lib/db.mjs');
const { migrate } = await import('./migrate.mjs');
const { seed } = await import('./seed.mjs');
const { run, commands, format, cents, date, time, complianceChecks } = await import('./rooms.mjs');

let checks = 0;
const seen = new Set();
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const rejects = async (fn, re) => { await assert.rejects(fn, re); checks++; };
const BY = { by: 'Test Receptionist' };
const argv = (c, pos, flags) => [c, ...pos, ...Object.entries(flags).map(([k, v]) => (v === true ? `--${k}` : `--${k}=${v}`))];
let db;
const call = async (c, pos = [], flags = {}) => { seen.add(c); const out = await run(db, argv(c, pos, flags)); format(c, out, flags); return out; };
const write = (c, pos = [], flags = {}) => call(c, pos, { ...BY, ...flags });
const child = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  eq(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
};
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

try {
  db = await getDb();
  eq(db.mode, process.env.TEST_DATABASE_URL ? 'postgres' : 'pglite', 'tests never use an operational connection');
  if (process.env.TEST_DATABASE_URL) {
    const tables = await db.query("select tablename from pg_tables where schemaname = 'public'");
    if (tables.length) throw new Error('TEST_DATABASE_URL must point at an empty, disposable database');
  }

  // Migrate is repeatable; seed is idempotent.
  eq((await migrate(db)).ran.length, readdirSync(path.join(REPO_ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).length);
  eq((await migrate(db)).ran.length, 0);
  await seed(db);
  const count = async (t) => (await db.query(`select count(*)::int as n from ${t}`))[0].n;
  const before = await count('appointments');
  await seed(db);
  eq(await count('appointments'), before, 'seed runs once');
  eq(await count('patients'), 12);

  // Input parsing.
  eq(cents('350'), 35000); eq(cents('$1,200.50'), 120050); eq(cents('6.2k'), 620000);
  eq(date('31/03/2026'), '2026-03-31'); eq(time('2:15pm'), '14:15'); eq(time('9:30am'), '09:30');
  await rejects(async () => date('2026-02-30'), /Invalid/);
  await rejects(() => call('nonsense'), /Unknown command/);
  await rejects(() => call('letters', [], { banana: 1 }), /Unknown flag/);

  // Reads, each with something to say on the demo rooms.
  eq((await call('help')).length, commands.length);
  for (const c of ['patients', 'upcoming', 'referrals', 'procedures', 'consents', 'waitlist', 'letters', 'results', 'recalls', 'debtors',
    'referrers', 'conversion', 'dna', 'providers', 'registrations', 'retention', 'attention'])
    ok((await call(c)).length > 0, `${c} has demo rows`);

  const ref = await call('referrals', [], { expiring: 30 });
  eq(ref.map((r) => r.code), ['REF-2001', 'REF-2011', 'REF-2006'], 'two referrals ended, one ends inside 30 days');
  eq((await call('referrals', [], { new: true })).map((r) => r.code).sort(), ['REF-2010', 'REF-2012', 'REF-2013']);
  eq((await call('consents')).map((r) => r.code), ['PX-4001', 'PX-4002', 'PX-4004']);
  eq((await call('waitlist')).map((r) => r.code), ['PX-4007', 'PX-4005']);
  eq((await call('letters')).map((r) => r.code), ['LT-5003', 'LT-5004', 'LT-5007']);
  eq((await call('results'))[0].abnormal, true, 'abnormal results first');
  eq((await call('recalls')).find((r) => r.patient === 'Tane Walker').next_booked, null);
  eq((await call('debtors')).map((r) => r.code), ['INV-6002', 'INV-6001', 'INV-6003', 'INV-6004']);
  eq((await call('debtors', [], { payer: 'wc' })).length, 1);
  eq((await call('referrers', [], { quiet: true })).map((r) => r.code), ['GP-04'], 'Dr Galloway has gone quiet');
  const conv = await call('conversion');
  eq(conv.map((r) => [r.surgeon, r.new_patients, r.went_to_procedure]), [['Dr Amelia Chen', 2, 2], ['Dr Rajiv Menon', 4, 3]]);
  eq((await call('dna')).length, 2);
  eq((await call('providers')).filter((r) => r.state === 'MISSING').map((r) => r.location), ['PR']);
  eq((await call('registrations'))[0].code, 'DR-02', 'soonest expiry first');
  eq((await call('retention'))[0].code, 'PT-1009');
  eq((await call('retention', [], { due: true })).length, 0);
  eq((await call('patients', [], { all: true })).length, 12);
  eq((await call('patients', [], { practitioner: 'menon' })).length, 5);
  eq((await call('day', [], { date: '+1d' })).map((r) => [r.patient, r.cover]), [['Margaret Ellis', 'expired']]);
  eq((await call('day', [], { date: '+3d', practitioner: 'menon', location: 'RM' })).length, 1);

  const attention = await call('attention');
  for (const issue of ['procedure without consent', 'referral expired', 'abnormal result waiting', 'no provider number', 'letter overdue', 'result waiting',
    'registration or indemnity', 'referral expiring', 'recall overdue', 'account 60+ days', 'referral not triaged'])
    ok(attention.some((a) => a.issue === issue), `attention shows ${issue}`);
  ok((await call('attention', [], { practitioner: 'chen' })).every((a) => a.who === 'Dr Amelia Chen'));

  // Compliance: the demo rooms have one of each problem.
  const comp = await call('compliance');
  const rule = (re) => comp.find((r) => re.test(r.rule));
  eq([rule(/referral valid/).breaches, rule(/referral valid/).due], [1, 2]);
  eq(rule(/referral valid/).items[0].ref, 'AP-3019', 'Margaret Ellis was billed on an expired referral');
  eq(rule(/provider number/).items.map((i) => i.ref), ['PR']);
  eq([rule(/fees in writing/).breaches, rule(/fees in writing/).due], [1, 2]);
  eq(rule(/registered/).status, 'due'); eq(rule(/indemnity/).status, 'due');
  eq(rule(/Records kept/).items.map((i) => i.ref), ['PT-1009']);
  eq(rule(/letter to the referring/).breaches, 2);
  eq(rule(/Results reviewed/).breaches, 2);
  ok((await call('compliance', [], { detail: true })).length === 8);

  // Patient lookup: code, name fragment, ambiguity.
  eq((await call('show', ['ellis'])).patient.code, 'PT-1001');
  const george = await call('show', ['pt-1004']);
  eq(george.procedures[0].code, 'PX-4001');
  eq(george.referrals.length, 2);
  await rejects(() => call('show', ['an']), /Ambiguous patient "an"/);
  await rejects(() => call('show', ['nobody']), /No patient matches/);

  // Writes need a name for the audit log.
  await rejects(() => call('log', ['PT-1003'], { summary: 'x' }), /--by/);
  await write('log', ['PT-1003'], { summary: 'Rang to confirm Parramatta review' });
  await write('log', [], { referrer: 'galloway', kind: 'visit', summary: 'Lunch with the Mosman Junction doctors' });

  // A referral expiring: record the new one and the booking is covered again.
  await write('add-referral', ['Margaret Ellis'], { from: 'GP-01', to: 'chen', issued: '-2d', reason: 'Right knee, ongoing care' });
  eq((await call('day', [], { date: '+1d' }))[0].cover, 'valid');
  await write('add-referral', ['Sarah Kim'], { from: 'park', to: 'chen', issued: 'today', indefinite: true, reason: 'Ongoing knee care' });
  eq((await complianceChecks(db)).find((r) => /referral valid/.test(r.rule)).due, 0, 'both upcoming bookings are covered again');
  await write('triage', ['REF-2012'], { urgency: 'soon' });
  await write('triage', ['REF-2013'], { status: 'declined', note: 'Physio cannot refer for Medicare' });
  eq((await call('referrals', [], { new: true })).map((r) => r.code), ['REF-2010', 'REF-2012', 'REF-2014', 'REF-2015'], 'urgency first, then oldest');

  // Consent before a procedure is booked.
  await rejects(() => write('consent', ['PX-4004']), /--given, --signed/);
  await write('consent', ['PX-4001'], { given: true });
  await rejects(() => write('schedule', ['PX-4004'], { status: 'booked' }), /No signed fee estimate/);
  await rejects(() => write('schedule', ['PX-4004'], { status: 'booked', override: true }), /--reason/);
  await write('consent', ['PX-4004'], { given: true, signed: true });
  eq((await write('schedule', ['PX-4004'], { status: 'booked', 'hospital-booked': true }))[0].status, 'booked');
  await write('consent', ['PX-4001'], { signed: true });
  await write('consent', ['PX-4002'], { signed: true, on: '-1d' });
  eq(rule(/fees in writing/) && (await complianceChecks(db)).find((r) => /fees in writing/.test(r.rule)).status, 'clean');
  const planned = await write('plan', ['Tane Walker'], { surgeon: 'menon', hospital: 'NDS', procedure: 'Trigger finger release, right ring', fee: '1200', rebate: '400' });
  eq(planned[0].status, 'waitlist');
  await write('schedule', [planned[0].code], { date: '+45d', status: 'planned' });
  ok((await call('consents')).some((r) => r.code === planned[0].code));
  ok((await call('procedures', [], { all: true, days: 3650 })).some((r) => r.status === 'done'));

  // Booking, attending, the letter that follows.
  const b = await write('book', ['Tane Walker'], { with: 'menon', at: '+2d', time: '11:00', location: 'RM', kind: 'initial' });
  eq(b[0].referral, 'valid');
  await rejects(() => write('book', ['Hamish Cole'], { with: 'menon', at: '+2d', time: '11:15', location: 'RM' }), /overlaps/);
  await write('book', ['Hamish Cole'], { with: 'menon', at: '+2d', time: '11:15', location: 'RM', double: true });
  await rejects(() => write('book', ['Hamish Cole'], { with: 'menon', at: '+2d', time: '25:00', location: 'RM' }), /Invalid --time/);
  const att = await write('attend', [b[0].appointment], { item: 104, fee: 350 });
  ok(att[0].letter_owed.startsWith('LT-'), 'an initial consult opens a letter');
  eq((await db.query('select first_seen_on from referrals where code = $1', ['REF-2012']))[0].first_seen_on !== null, true, 'first consultation starts the referral clock');
  eq((await write('attend', ['AP-3101'], { status: 'dna' }))[0].status, 'did_not_attend');
  await write('letter-sent', [att[0].letter_owed], { summary: 'Injected, review in six weeks' });
  await write('letter-sent', ['LT-5003']);
  await write('letter-sent', ['LT-5004'], { dictated: '-1d' });
  eq((await call('letters')).map((r) => r.code), ['LT-5007']);
  ok((await call('upcoming', [], { days: 30 })).length > 5);

  // Results, recalls, accounts, notes.
  await write('add-result', ['Tane Walker'], { test: 'Ultrasound right hand', doctor: 'menon', abnormal: true });
  await write('review-result', ['Papadopoulos'], { action: 'Low haemoglobin. Iron infusion before surgery.' });
  await write('review-result', ['Okafor'], { action: 'Normal' });
  await write('review-result', ['Tane Walker'], { test: 'ultrasound', action: 'Confirms nodule' });
  await rejects(() => write('review-result', ['Tane Walker'], { action: 'x' }), /No unreviewed result/);
  eq((await complianceChecks(db)).find((r) => /Results reviewed/.test(r.rule)).status, 'clean');
  await write('recall', ['Tane Walker'], { done: true });
  await write('recall', ['Tane Walker'], { with: 'menon', due: '+42d', reason: 'Six week trigger finger review' });
  await rejects(() => write('recall', ['Ana Silva'], { done: true }), /No open recall/);
  const inv = await write('invoice', ['Tane Walker'], { amount: '210', appointment: b[0].appointment });
  await write('pay', [inv[0].code], { amount: '210' });
  eq((await db.query('select status from invoices where code = $1', [inv[0].code]))[0].status, 'paid');
  await rejects(() => write('pay', ['INV-6002'], { 'write-off': true }), /--reason/);
  await write('pay', ['INV-6002'], { 'write-off': true, reason: 'Insurer declined the report fee' });
  eq((await call('debtors', [], { payer: 'workers_comp' })).length, 0);
  await write('note', ['Tane Walker'], { text: 'Nodule at A1 pulley. Injected.', doctor: 'menon' });
  await write('add-patient', [], { name: 'Olivia Grant', born: '12/05/1984', fund: 'HCF', gp: 'liu', medicare: true });
  ok((await call('show', ['olivia'])).patient.code.startsWith('PT-'));
  await write('add-referrer', [], { name: 'Dr Ben Ashworth', practice: 'Neutral Bay Medical', prefers: 'email' });
  ok((await db.query("select code from referrers where name = 'Dr Ben Ashworth'"))[0].code.startsWith('GP-'));

  // Provider numbers, registrations and retention.
  await write('provider-number', [], { practitioner: 'menon', location: 'PR', number: '3456783c', opened: '-90d' });
  eq((await call('providers')).filter((r) => r.state === 'MISSING').length, 0);
  await write('provider-number', [], { practitioner: 'chen', location: 'TEL', close: true });
  await rejects(() => write('provider-number', [], { practitioner: 'chen', location: 'TEL', close: true }), /No open provider number/);
  await write('renew', ['Menon'], { indemnity: plus(400) });
  await write('renew', ['Kate'], { registration: plus(200) });
  const reg = (await complianceChecks(db)).filter((r) => /registered|indemnity/.test(r.rule));
  eq(reg.map((r) => r.status), ['clean', 'clean']);
  await rejects(() => write('dispose', ['PT-1009'], { on: '+30d' }), /must be kept until/);
  await rejects(() => write('dispose', ['PT-1001'], { on: '+30d' }), /active patient/);
  await write('dispose', ['PT-1009'], { clear: true });
  eq((await complianceChecks(db)).find((r) => /Records kept/.test(r.rule)).status, 'clean');
  const keep = iso((await db.query("select keep_until from v_retention where code = 'PT-1009'"))[0].keep_until);
  await write('dispose', ['PT-1009'], { on: keep });
  ok((await db.query("select count(*)::int as n from audit where action = 'dispose'"))[0].n === 2, 'every write is audited');

  // Import from Gentu report exports.
  const fx = (f) => path.join(REPO_ROOT, 'test', 'fixtures', f);
  const dry = await write('import', ['gentu'], { patients: fx('gentu-patients.csv'), appointments: fx('gentu-appointments.csv'), 'dry-run': true });
  eq(dry[0].patients_new, 3); eq(await count('patients'), 13, 'dry run saves nothing');
  const imp = await write('import', ['gentu'], { patients: fx('gentu-patients.csv'), appointments: fx('gentu-appointments.csv') });
  eq([imp[0].patients_new, imp[0].referrers_new, imp[0].practitioners_new, imp[0].appointments_new, imp[0].skipped], [3, 1, 1, 3, 2]);
  const again = await write('import', ['gentu'], { patients: fx('gentu-patients.csv'), appointments: fx('gentu-appointments.csv') });
  eq([again[0].patients_new, again[0].patients_matched, again[0].appointments_new, again[0].appointments_matched], [0, 3, 0, 3], 'import is repeatable');
  const joan = (await db.query("select p.born_on, p.health_fund, p.medicare_on_file, g.name as gp from patients p left join referrers g on g.id = p.usual_gp_id where p.name = 'Joan Whitfield'"))[0];
  eq([iso(joan.born_on), joan.health_fund, joan.medicare_on_file, joan.gp], ['1956-02-14', 'Bupa', true, 'Dr Helen Park']);
  eq((await db.query("select name from patients where source_ref = 'gentu:G-88102'"))[0].name, 'Ahmed Haddad, Jr');
  const a501 = (await db.query("select a.status, a.kind, a.item_number, a.fee_cents, to_char(a.starts_at, 'HH24:MI') as at, pr.name from appointments a join practitioners pr on pr.id = a.practitioner_id where a.source_ref = 'gentu:A-501'"))[0];
  eq([a501.status, a501.kind, a501.item_number, Number(a501.fee_cents), a501.at, a501.name], ['attended', 'initial', '104', 35000, '09:30', 'Dr Amelia Chen']);
  eq((await db.query("select status from appointments where source_ref = 'gentu:A-502'"))[0].status, 'did_not_attend');
  await rejects(() => write('import', ['cliniko'], { patients: fx('gentu-patients.csv') }), /Usage: import gentu/);

  // Export every table.
  const exp = await call('export', [], { out: path.relative(REPO_ROOT, path.join(temp, 'export')) });
  eq(exp.length, 16);
  ok(readFileSync(path.join(temp, 'export', 'patients.csv'), 'utf8').includes('Joan Whitfield'));

  for (const c of commands) ok(seen.has(c), `smoke covers ${c}`);
  await db.close();
  db = null;

  // The documents, views and CLI run as their own processes.
  ok(child(['scripts/rooms.mjs', 'attention']).includes('recall overdue'), 'CLI runs as a process');
  const docsOut = child(['scripts/docs.mjs']);
  ok(/document\(s\) rendered/.test(docsOut) && !/^0 document/m.test(docsOut), 'documents render');
  ok(child(['scripts/view.mjs']).includes('view:'), 'views render');
  const bad = spawnSync(process.execPath, ['scripts/rooms.mjs', 'show', 'an'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  eq(bad.status, 1); ok(/Ambiguous/.test(bad.stderr));
  console.log(`PASS  ${checks} checks, ${commands.length} CLI commands (${process.env.TEST_DATABASE_URL ? 'postgres' : 'pglite'})`);
} finally {
  if (db) await db.close();
  rmSync(temp, { recursive: true, force: true });
}

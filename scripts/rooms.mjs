#!/usr/bin/env node
// The one CLI for the rooms. Human tables by default, --json for machines.
//
//   npm run rooms -- attention
//   npm run rooms -- show ellis
//   npm run rooms -- consent PX-4001 --given --by="Mia Torres"
//   npm run rooms -- import gentu --patients=patients.csv --appointments=appointments.csv --by="Mia Torres"
//
// Patients match on code, id prefix or part of the name, case-insensitive. An ambiguous
// match lists the candidates and exits 1. Every write needs --by and lands in the audit log.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { heading, isoDate, money, table, truncate } from './lib/format.mjs';

// ---------------------------------------------------------------- input helpers

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq < 0) flags[a.slice(2)] = true;
      else flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else pos.push(a);
  }
  return { pos, flags };
}

export function date(v, what = 'date') {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim();
  if (s === 'today') return isoDate(new Date());
  const m = s.match(/^([+-]\d+)d$/);
  if (m) return isoDate(new Date(Date.now() + Number(m[1]) * 86400000));
  const au = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // Australian exports: 31/03/2026
  const iso = au ? `${au[3]}-${au[2].padStart(2, '0')}-${au[1].padStart(2, '0')}` : s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid ${what} "${s}": use YYYY-MM-DD, DD/MM/YYYY, today, or +30d`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Invalid ${what} "${s}"`);
  return iso;
}

// "09:30", "2:15pm" -> "09:30"
export function time(v, what = 'time') {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const m = String(v).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new Error(`Invalid ${what} "${v}": use 09:30 or 2:15pm`);
  let h = Number(m[1]);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || Number(m[2] || 0) > 59) throw new Error(`Invalid ${what} "${v}"`);
  return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}

// "350", "$1,200.50", "6.2k" -> cents
export function cents(v, what = 'amount') {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim().replace(/[$,\s]/g, '').toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) throw new Error(`Invalid ${what} "${v}": use 350, 1200.50 or 6.2k`);
  return Math.round(Number(m[1]) * (m[2] ? 1000 : 1) * 100);
}

function int(v, what, lo, hi) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  if (!/^-?\d+$/.test(String(v))) throw new Error(`${what} must be a whole number`);
  const n = Number(v);
  if ((lo !== undefined && n < lo) || (hi !== undefined && n > hi)) throw new Error(`${what} must be between ${lo} and ${hi}`);
  return n;
}

function oneOf(v, allowed, what) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const alias = { dna: 'did_not_attend', no_show: 'did_not_attend', wc: 'workers_comp', fund: 'health_fund' }[s] || s;
  if (!allowed.includes(alias)) throw new Error(`${what} must be one of: ${allowed.join(', ')}`);
  return alias;
}

function need(flags, ...names) {
  for (const n of names) if (flags[n] === undefined || flags[n] === true || flags[n] === '') throw new Error(`Missing --${n}`);
}

const days = (n) => (n === null || n === undefined ? '' : n < 0 ? `${-n} ago` : `${n}`);
const late = (n) => (n === null || n === undefined ? '' : n > 0 ? `${n} late` : n === 0 ? 'today' : `in ${-n}`);
const label = (s) => String(s || '').replace(/_/g, ' ');
const d = (v) => (v instanceof Date ? isoDate(v) : v ?? '');
const pct = (a, b) => (Number(b) ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '');

// ---------------------------------------------------------------- lookups

const SPEC = {
  patient: { table: 'patients', label: "code || '  ' || name", name: 'name' },
  practitioner: { table: 'practitioners', label: "code || '  ' || name", name: 'name' },
  location: { table: 'locations', label: "code || '  ' || name", name: 'name' },
  referrer: { table: 'referrers', label: "code || '  ' || name || coalesce(', ' || practice, '')", name: "name || ' ' || coalesce(practice, '')" },
  referral: { table: 'referrals', label: "code || '  ' || coalesce(reason, '')", name: 'reason' },
  appointment: { table: 'appointments', label: "code || '  ' || starts_at::date::text", name: 'note' },
  procedure: { table: 'procedures', label: "code || '  ' || procedure", name: 'procedure' },
  letter: { table: 'letters', label: "code || '  ' || kind", name: 'summary' },
  invoice: { table: 'invoices', label: "code || '  ' || amount_cents::text", name: 'note' },
};

async function resolve(db, entity, term) {
  if (!term || term === true) throw new Error(`Name the ${entity}`);
  const spec = SPEC[entity];
  const t = String(term).trim();
  let rows = await db.query(`select id, ${spec.label} as label from ${spec.table} where lower(code) = lower($1)`, [t]);
  if (!rows.length && /^[0-9a-f-]{4,}$/i.test(t)) rows = await db.query(`select id, ${spec.label} as label from ${spec.table} where id::text like $1`, [`${t.toLowerCase()}%`]);
  if (!rows.length) rows = await db.query(`select id, ${spec.label} as label from ${spec.table} where ${spec.name} ilike $1 order by code`, [`%${t}%`]);
  if (!rows.length) throw new Error(`No ${entity} matches "${t}"`);
  if (rows.length > 1) {
    const err = new Error(`Ambiguous ${entity} "${t}": ${rows.map((r) => r.label).join('; ')}`);
    err.candidates = rows;
    throw err;
  }
  return rows[0].id;
}

const codeOf = async (db, table, id) => (await db.query(`select code from ${table} where id = $1`, [id]))[0].code;

async function nextCode(db, table, prefix, start) {
  const [r] = await db.query(`select coalesce(max(nullif(regexp_replace(code, '^${prefix}-', ''), code)::int), $1) + 1 as n
                              from ${table} where code ~ '^${prefix}-[0-9]+$'`, [start]);
  return `${prefix}-${r.n}`;
}

async function audit(db, actor, action, entity, ref, detail = {}) {
  await db.query('insert into audit (actor, action, entity, ref, detail) values ($1, $2, $3, $4, $5)', [actor, action, entity, ref, JSON.stringify(detail)]);
}

function actor(flags) {
  if (!flags.by || flags.by === true) throw new Error('Writes need --by="Your Name" for the audit log');
  return String(flags.by);
}

async function policy(db) {
  const rows = await db.query('select key, value from policy');
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

async function tx(db, fn) {
  await db.exec('BEGIN');
  try {
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- the compliance rules (docs/compliance.md)

export async function complianceChecks(db) {
  const p = await policy(db);
  const out = [];
  const add = (rule, source, items, dueItems = []) =>
    out.push({ rule, source, status: items.length ? 'breach' : dueItems.length ? 'due' : 'clean', breaches: items.length, due: dueItems.length, items: [...items, ...dueItems] });

  const cover = await db.query(`select code, patient, practitioner, on_date, status, cover, referral_code, valid_until, item_number
                                from v_referral_cover where cover in ('expired', 'no referral')
                                and ((status = 'attended' and item_number is not null and on_date > current_date - 365)
                                  or (status = 'booked' and on_date <= current_date + 30)) order by on_date`);
  const coverDetail = (r) => `${isoDate(r.on_date)} with ${r.practitioner}: ${r.referral_code ? `referral ${r.referral_code} ended ${isoDate(r.valid_until)}` : 'no referral on file'}`;
  add('Every specialist consultation billed to Medicare has a referral valid on the day', 'Services Australia, Referrals for specialist treatment (GP referral 12 months, specialist referral 3 months, from the first consultation)',
    cover.filter((r) => r.status === 'attended').map((r) => ({ ref: r.code, patient: r.patient, detail: `billed item ${r.item_number} on ${coverDetail(r)}` })),
    cover.filter((r) => r.status === 'booked').map((r) => ({ ref: r.code, patient: r.patient, detail: `booked ${coverDetail(r)}` })));

  const gaps = await db.query('select practitioner, location_code, location, first_booking from v_provider_gaps order by practitioner');
  add('A provider number for each location a practitioner works from', 'Services Australia, Application for a Medicare provider number (HW019): a unique provider number for each location',
    gaps.map((r) => ({ ref: r.location_code, patient: '', detail: `${r.practitioner} booked at ${r.location} from ${isoDate(r.first_booking)} with no open provider number` })));

  const ifc = await db.query(`select code, patient, surgeon, procedure, planned_on, days_to_go, ifc_given_on, ifc_signed_on, status
                              from v_procedures where status in ('planned', 'booked') and planned_on is not null and ifc_signed_on is null order by planned_on`);
  const ifcDetail = (r) => `${r.procedure} in ${r.days_to_go} days, ${r.ifc_given_on ? `estimate given ${isoDate(r.ifc_given_on)}, not signed` : 'no fee estimate given'}`;
  add(`Patients agree the fees in writing at least ${p.ifc_days} days before a procedure`, 'Medical Board of Australia, Good medical practice, 4.5.3 (fees discussed in time for an informed decision)',
    ifc.filter((r) => r.days_to_go < p.ifc_days).map((r) => ({ ref: r.code, patient: r.patient, detail: ifcDetail(r) })),
    ifc.filter((r) => r.days_to_go >= p.ifc_days && r.days_to_go < p.ifc_days + 14).map((r) => ({ ref: r.code, patient: r.patient, detail: ifcDetail(r) })));

  const reg = await db.query('select code, name, role, registration_expires_on, indemnity_expires_on, registration_days, indemnity_days from v_registrations order by name');
  add('Every practitioner registered on the day they practise', 'Medical Board of Australia, Registration renewal (renew by 30 September; one-month late period)',
    reg.filter((r) => r.registration_days !== null && r.registration_days < 0).map((r) => ({ ref: r.code, patient: '', detail: `${r.name} registration ended ${isoDate(r.registration_expires_on)}` })),
    reg.filter((r) => r.registration_days !== null && r.registration_days >= 0 && r.registration_days <= p.registration_warn_days)
      .map((r) => ({ ref: r.code, patient: '', detail: `${r.name} registration ends ${isoDate(r.registration_expires_on)}` })));
  add('Professional indemnity insurance in force for every practitioner', 'Health Practitioner Regulation National Law, s 129',
    reg.filter((r) => r.indemnity_days !== null && r.indemnity_days < 0).map((r) => ({ ref: r.code, patient: '', detail: `${r.name} cover ended ${isoDate(r.indemnity_expires_on)}` })),
    reg.filter((r) => r.indemnity_days !== null && r.indemnity_days >= 0 && r.indemnity_days <= p.registration_warn_days)
      .map((r) => ({ ref: r.code, patient: '', detail: `${r.name} cover ends ${isoDate(r.indemnity_expires_on)}` })));

  const ret = await db.query('select code, name, disposal_on, keep_until, last_service_on from v_retention where disposal_on is not null order by disposal_on');
  add(`Records kept ${p.retention_years_adult} years after the last service, and a child's record to age ${p.retention_age_minor}`,
    'Health Records and Information Privacy Act 2002 (NSW) s 25; Health (Retention of Health Information) Regulations 1996 (NZ) regs 5 and 6',
    ret.filter((r) => r.keep_until && isoDate(r.disposal_on) < isoDate(r.keep_until))
      .map((r) => ({ ref: r.code, patient: r.name, detail: `disposal set for ${isoDate(r.disposal_on)}, must keep until ${isoDate(r.keep_until)}` })));

  const letters = await db.query('select code, patient, practitioner, referrer, kind, due_on, days_late from v_letters_owed order by due_on');
  add(`A letter to the referring doctor within ${p.letter_days} days`, 'Your practice standard (keep the referrer informed)',
    letters.filter((r) => r.days_late > 0).map((r) => ({ ref: r.code, patient: r.patient, detail: `${r.kind} letter to ${r.referrer || 'referrer'}, ${r.days_late} days late` })),
    letters.filter((r) => r.days_late <= 0 && r.days_late > -7).map((r) => ({ ref: r.code, patient: r.patient, detail: `due ${isoDate(r.due_on)}` })));

  const results = await db.query('select patient, practitioner, test, received_on, abnormal, days_waiting from v_results_waiting order by received_on');
  add(`Results reviewed by a doctor within ${p.result_days} days, abnormal ones the next day`, 'Your practice standard (results follow-up)',
    results.filter((r) => r.days_waiting > p.result_days || (r.abnormal && r.days_waiting >= 1))
      .map((r) => ({ ref: r.test, patient: r.patient, detail: `${r.abnormal ? 'ABNORMAL, ' : ''}${r.days_waiting} days with ${r.practitioner}` })));
  return out;
}

// ---------------------------------------------------------------- commands

const C = {};
const cmd = (name, summary, fn, opts = {}) => (C[name] = { name, summary, fn, ...opts });

cmd('help', 'List every command', async () => Object.values(C).map((c) => ({ command: c.name, does: c.summary })),
  { cols: [{ key: 'command', label: 'command' }, { key: 'does', label: 'what it does' }] });

cmd('patients', 'Patients with their GP, fund and next booking (--practitioner, --all)', async (db, pos, f) => {
  const params = [];
  const where = [f.all ? 'true' : "p.status = 'active'"];
  if (f.practitioner) {
    params.push(await resolve(db, 'practitioner', f.practitioner));
    where.push(`exists (select 1 from appointments a where a.patient_id = p.id and a.practitioner_id = $${params.length})`);
  }
  return db.query(`
    select p.code, p.name, extract(year from age(p.born_on))::int as age, p.health_fund, g.name as gp, p.status,
           (select max(a.starts_at)::date from appointments a where a.patient_id = p.id and a.status = 'attended') as last_seen,
           (select min(a.starts_at)::date from appointments a where a.patient_id = p.id and a.status = 'booked' and a.starts_at >= current_date) as next_booked
    from patients p left join referrers g on g.id = p.usual_gp_id where ${where.join(' and ')} order by p.code`, params);
}, { flags: ['practitioner', 'all'], cols: [
  { key: 'code', label: 'code' }, { key: 'name', label: 'patient' }, { key: 'age', label: 'age', align: 'right' }, { key: 'health_fund', label: 'fund' },
  { key: 'gp', label: 'GP' }, { key: 'last_seen', label: 'last seen', format: d }, { key: 'next_booked', label: 'next', format: d }, { key: 'status', label: 'status' }] });

cmd('show', 'One patient: referrals and validity, bookings, procedures, letters, results, recalls, accounts, notes', async (db, pos) => {
  const id = await resolve(db, 'patient', pos.join(' '));
  const [patient] = await db.query(`select p.*, g.name as gp, g.practice as gp_practice from patients p left join referrers g on g.id = p.usual_gp_id where p.id = $1`, [id]);
  const code = patient.code;
  return {
    patient,
    referrals: await db.query('select code, referrer, referrer_kind, practitioner, issued_on, first_seen_on, valid_until, indefinite, status from v_referrals where patient_code = $1 order by issued_on desc', [code]),
    appointments: await db.query(`select a.code, a.starts_at, a.kind, a.status, pr.name as practitioner, l.code as location, a.item_number, a.fee_cents
                                  from appointments a join practitioners pr on pr.id = a.practitioner_id join locations l on l.id = a.location_id
                                  where a.patient_id = $1 order by a.starts_at desc limit 12`, [id]),
    procedures: await db.query('select code, procedure, planned_on, status, surgeon, hospital, fee_cents, gap_cents, ifc_given_on, ifc_signed_on from v_procedures where patient_code = $1 order by planned_on desc nulls first', [code]),
    letters: await db.query('select code, kind, due_on, sent_on from letters where patient_id = $1 order by due_on desc', [id]),
    results: await db.query('select test, received_on, abnormal, reviewed_on, action from results where patient_id = $1 order by received_on desc', [id]),
    recalls: await db.query('select due_on, reason, done_on from recalls where patient_id = $1 order by due_on desc', [id]),
    invoices: await db.query('select code, payer, issued_on, amount_cents, paid_cents, status from invoices where patient_id = $1 order by issued_on desc', [id]),
    notes: await db.query('select written_on, note from clinical_notes where patient_id = $1 order by written_on desc limit 3', [id]),
    retention: (await db.query('select keep_until, disposal_on from v_retention where id = $1', [id]))[0],
  };
}, { render: renderShow });

cmd('day', 'The clinic list for a day, with referral cover (--date=today, --practitioner, --location)', async (db, pos, f) => {
  const on = date(f.date, '--date') || isoDate(new Date());
  const params = [on];
  const where = ['a.starts_at::date = $1', "a.status <> 'cancelled'"];
  if (f.practitioner) { params.push(await resolve(db, 'practitioner', f.practitioner)); where.push(`a.practitioner_id = $${params.length}`); }
  if (f.location) { params.push(await resolve(db, 'location', f.location)); where.push(`a.location_id = $${params.length}`); }
  return db.query(`select a.code, to_char(a.starts_at, 'HH24:MI') as at, a.minutes, pr.name as practitioner, l.code as location, p.code as patient_code, p.name as patient,
                          a.kind, a.status, coalesce(c.cover, '') as cover, a.note
                   from appointments a join patients p on p.id = a.patient_id join practitioners pr on pr.id = a.practitioner_id
                   join locations l on l.id = a.location_id left join v_referral_cover c on c.id = a.id
                   where ${where.join(' and ')} order by pr.name, a.starts_at`, params);
}, { flags: ['date', 'practitioner', 'location'], cols: [
  { key: 'at', label: 'time' }, { key: 'practitioner', label: 'with' }, { key: 'location', label: 'where' }, { key: 'patient', label: 'patient' },
  { key: 'kind', label: 'type', format: label }, { key: 'status', label: 'status', format: label }, { key: 'cover', label: 'referral' }, { key: 'note', label: 'note', format: (v) => truncate(v, 40) }] });

cmd('upcoming', 'Bookings in the next --days=14, with referral cover', async (db, pos, f) => {
  const n = int(f.days ?? 14, '--days', 1, 365);
  return db.query(`select a.code, a.starts_at, pr.name as practitioner, l.code as location, p.name as patient, a.kind, coalesce(c.cover, '') as cover
                   from appointments a join patients p on p.id = a.patient_id join practitioners pr on pr.id = a.practitioner_id
                   join locations l on l.id = a.location_id left join v_referral_cover c on c.id = a.id
                   where a.status = 'booked' and a.starts_at >= current_date and a.starts_at < current_date + $1::int order by a.starts_at`, [n]);
}, { flags: ['days'], cols: [
  { key: 'starts_at', label: 'when', format: (v) => (v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v) }, { key: 'practitioner', label: 'with' },
  { key: 'location', label: 'where' }, { key: 'patient', label: 'patient' }, { key: 'kind', label: 'type', format: label }, { key: 'cover', label: 'referral' }] });

cmd('referrals', 'Referrals and when each runs out (--expiring=60 for active ones ending soon, --new for untriaged)', async (db, pos, f) => {
  if (f.new) return db.query("select code, patient, referrer, practitioner, received_on, urgency, reason, status, valid_until from v_referrals where status in ('received', 'triaged') order by array_position(array['urgent', 'soon', 'routine'], urgency), received_on");
  const n = int(f.expiring === true ? 60 : f.expiring ?? 3650, '--expiring', 0, 3650);
  return db.query(`select v.code, v.patient, v.referrer, v.practitioner, v.first_seen_on, v.valid_until, (v.valid_until - current_date) as days_left, v.status, v.indefinite,
                          (select min(a.starts_at)::date from appointments a join referrals r on r.id = v.id
                           where a.patient_id = r.patient_id and a.practitioner_id = r.practitioner_id and a.status = 'booked' and a.starts_at >= current_date) as next_booked
                   from v_referrals v where v.status in ('active', 'booked', 'triaged', 'received')
                     and (v.indefinite = false and v.valid_until <= current_date + $1::int or $1 >= 3650)
                   order by v.indefinite, v.valid_until`, [n]);
}, { flags: ['expiring', 'new'], cols: [
  { key: 'code', label: 'referral' }, { key: 'patient', label: 'patient' }, { key: 'referrer', label: 'from' }, { key: 'practitioner', label: 'to' },
  { key: 'valid_until', label: 'valid until', format: (v, r) => (r.indefinite ? 'indefinite' : d(v)) },
  { key: 'days_left', label: 'days left', align: 'right', format: (v, r) => (r.indefinite || v === undefined ? '' : v < 0 ? `ended ${-v} ago` : v) },
  { key: 'next_booked', label: 'next booked', format: d }, { key: 'status', label: 'status' }] });

cmd('procedures', 'The procedure list for the next --days=60: hospital, fee, gap and consent (--all includes done)', async (db, pos, f) => {
  const n = int(f.days ?? 60, '--days', 1, 3650);
  return db.query(`select code, planned_on, surgeon, anaesthetist, hospital, patient, procedure, status, fee_cents, gap_cents, ifc_given_on, ifc_signed_on, hospital_booked_on
                   from v_procedures where planned_on is not null and ${f.all ? 'true' : "status in ('planned', 'booked')"} and planned_on <= current_date + $1::int
                   order by planned_on`, [n]);
}, { flags: ['days', 'all'], cols: [
  { key: 'planned_on', label: 'date', format: d }, { key: 'surgeon', label: 'surgeon' }, { key: 'hospital', label: 'hospital' }, { key: 'patient', label: 'patient' },
  { key: 'procedure', label: 'procedure', format: (v) => truncate(v, 34) }, { key: 'gap_cents', label: 'est. gap', align: 'right', format: (v) => money(v) },
  { key: 'ifc_signed_on', label: 'consent', format: (v, r) => (v ? 'signed' : r.ifc_given_on ? 'sent, unsigned' : 'NONE') },
  { key: 'hospital_booked_on', label: 'hospital', format: (v) => (v ? 'booked' : 'not booked') }] });

cmd('consents', 'Procedures still waiting on a signed fee estimate, soonest first', async (db) =>
  db.query(`select code, planned_on, days_to_go, patient, surgeon, procedure, fee_cents, gap_cents, ifc_given_on, health_fund
            from v_procedures where status in ('planned', 'booked') and ifc_signed_on is null order by planned_on nulls last`), { cols: [
  { key: 'code', label: 'procedure' }, { key: 'planned_on', label: 'date', format: d }, { key: 'days_to_go', label: 'days', align: 'right' }, { key: 'patient', label: 'patient' },
  { key: 'procedure', label: 'what', format: (v) => truncate(v, 30) }, { key: 'fee_cents', label: 'fee', align: 'right', format: (v) => money(v) },
  { key: 'gap_cents', label: 'est. gap', align: 'right', format: (v) => money(v) }, { key: 'ifc_given_on', label: 'estimate sent', format: (v) => (v ? d(v) : 'not sent') }] });

cmd('waitlist', 'Patients waiting for a procedure with no date, longest wait first', async (db) =>
  db.query("select code, patient, surgeon, procedure, urgency, added_on, days_waiting, health_fund from v_procedures where status = 'waitlist' or (status = 'planned' and planned_on is null) order by array_position(array['urgent', 'soon', 'routine'], urgency), added_on"),
  { cols: [{ key: 'code', label: 'procedure' }, { key: 'patient', label: 'patient' }, { key: 'surgeon', label: 'surgeon' }, { key: 'procedure', label: 'what', format: (v) => truncate(v, 34) },
    { key: 'urgency', label: 'urgency' }, { key: 'days_waiting', label: 'waiting', align: 'right', format: (v) => `${v} days` }, { key: 'health_fund', label: 'fund' }] });

cmd('letters', 'Letters owed to referring doctors, most overdue first', async (db) =>
  db.query('select code, patient, practitioner, referrer, prefers, kind, due_on, dictated_on, days_late from v_letters_owed order by due_on'), { cols: [
  { key: 'code', label: 'letter' }, { key: 'patient', label: 'patient' }, { key: 'practitioner', label: 'doctor' }, { key: 'referrer', label: 'to' },
  { key: 'kind', label: 'kind' }, { key: 'due_on', label: 'due', format: d }, { key: 'days_late', label: 'status', align: 'right', format: late },
  { key: 'dictated_on', label: 'dictated', format: (v) => (v ? d(v) : 'not yet') }, { key: 'prefers', label: 'send by', format: label }] });

cmd('results', 'Results no doctor has reviewed yet, abnormal first', async (db) =>
  db.query('select patient_code, patient, practitioner, test, provider, received_on, abnormal, days_waiting from v_results_waiting order by abnormal desc, received_on'), { cols: [
  { key: 'patient', label: 'patient' }, { key: 'practitioner', label: 'doctor' }, { key: 'test', label: 'test' }, { key: 'received_on', label: 'received', format: d },
  { key: 'days_waiting', label: 'waiting', align: 'right', format: (v) => `${v} days` }, { key: 'abnormal', label: 'flag', format: (v) => (v ? 'ABNORMAL' : '') }] });

cmd('recalls', 'Recalls due in the next --days=30 or overdue, and whether anything is booked', async (db, pos, f) => {
  const n = int(f.days ?? 30, '--days', 0, 3650);
  return db.query('select patient_code, patient, practitioner, due_on, days_to_due, reason, next_booked from v_recalls_due where days_to_due <= $1 order by due_on', [n]);
}, { flags: ['days'], cols: [
  { key: 'patient', label: 'patient' }, { key: 'practitioner', label: 'doctor' }, { key: 'reason', label: 'reason' }, { key: 'due_on', label: 'due', format: d },
  { key: 'days_to_due', label: 'days', align: 'right', format: days }, { key: 'next_booked', label: 'booked', format: (v) => (v ? d(v) : 'NOTHING BOOKED') }] });

cmd('debtors', 'Open accounts by age and payer (--payer)', async (db, pos, f) => {
  const payer = oneOf(f.payer, ['patient', 'health_fund', 'medicare', 'third_party', 'workers_comp'], '--payer');
  return db.query('select code, patient, payer, issued_on, amount_cents, paid_cents, owing_cents, age_days, bucket from v_debtors where ($1::text is null or payer = $1) order by age_days desc', [payer]);
}, { flags: ['payer'], cols: [
  { key: 'code', label: 'account' }, { key: 'patient', label: 'patient' }, { key: 'payer', label: 'payer', format: label }, { key: 'issued_on', label: 'issued', format: d },
  { key: 'owing_cents', label: 'owing', align: 'right', format: (v) => money(v) }, { key: 'age_days', label: 'age', align: 'right', format: (v) => `${v} days` }, { key: 'bucket', label: 'bucket' }] });

cmd('referrers', 'Who sends new patients: the last 12 months against the 12 before, and who has gone quiet (--quiet)', async (db, pos, f) => {
  const p = await policy(db);
  const rows = await db.query('select code, name, kind, practice, last_12m, prior_12m, last_referral_on, days_since from v_referrer_trend where last_12m + prior_12m > 0 order by last_12m desc, prior_12m desc');
  return f.quiet ? rows.filter((r) => r.prior_12m > 0 && (r.days_since ?? 9999) > p.quiet_referrer_days) : rows;
}, { flags: ['quiet'], cols: [
  { key: 'code', label: 'code' }, { key: 'name', label: 'referrer' }, { key: 'practice', label: 'practice' }, { key: 'last_12m', label: 'last 12m', align: 'right' },
  { key: 'prior_12m', label: 'prior 12m', align: 'right' }, { key: 'last_referral_on', label: 'last sent', format: d }, { key: 'days_since', label: 'days since', align: 'right' }] });

cmd('conversion', 'Consultations against procedures booked, by surgeon, over --months=12', async (db, pos, f) => {
  const m = int(f.months ?? 12, '--months', 1, 120);
  return db.query(`with seen as (select distinct a.practitioner_id, a.patient_id from appointments a
                                    where a.kind = 'initial' and a.status = 'attended' and a.starts_at > current_date - make_interval(months => $1::int))
                   select pr.name as surgeon, count(s.patient_id)::int as new_patients,
                          count(s.patient_id) filter (where exists (select 1 from procedures x where x.practitioner_id = pr.id and x.patient_id = s.patient_id and x.status <> 'cancelled'))::int as went_to_procedure,
                          coalesce((select sum(x.fee_cents) from procedures x join seen z on z.patient_id = x.patient_id and z.practitioner_id = x.practitioner_id
                                    where x.practitioner_id = pr.id and x.status <> 'cancelled'), 0)::bigint as procedure_fees
                   from practitioners pr left join seen s on s.practitioner_id = pr.id
                   where pr.role = 'specialist' group by pr.id, pr.name order by pr.name`, [m]);
}, { flags: ['months'], cols: [
  { key: 'surgeon', label: 'surgeon' }, { key: 'new_patients', label: 'new patients', align: 'right' }, { key: 'went_to_procedure', label: 'to procedure', align: 'right' },
  { key: 'rate', label: 'rate', align: 'right', format: (v, r) => pct(r.went_to_procedure, r.new_patients) }, { key: 'procedure_fees', label: 'fees booked', align: 'right', format: (v) => money(v) }] });

cmd('dna', 'Patients who did not attend in the last --days=180, with how often', async (db, pos, f) => {
  const n = int(f.days ?? 180, '--days', 1, 3650);
  return db.query(`select p.code, p.name, pr.name as practitioner, count(*) filter (where a.status = 'did_not_attend')::int as missed, count(*)::int as booked,
                          max(a.starts_at) filter (where a.status = 'did_not_attend')::date as last_missed,
                          (select min(b.starts_at)::date from appointments b where b.patient_id = p.id and b.status = 'booked' and b.starts_at >= current_date) as next_booked
                   from appointments a join patients p on p.id = a.patient_id join practitioners pr on pr.id = a.practitioner_id
                   where a.starts_at > current_date - $1::int and a.starts_at < now()
                   group by p.id, p.code, p.name, pr.name having count(*) filter (where a.status = 'did_not_attend') > 0 order by missed desc, last_missed desc`, [n]);
}, { flags: ['days'], cols: [
  { key: 'name', label: 'patient' }, { key: 'practitioner', label: 'doctor' }, { key: 'missed', label: 'missed', align: 'right' }, { key: 'booked', label: 'of', align: 'right' },
  { key: 'last_missed', label: 'last missed', format: d }, { key: 'next_booked', label: 'next booked', format: (v) => (v ? d(v) : 'none') }] });

cmd('providers', 'Provider numbers by practitioner and location, and every location worked without one', async (db) => {
  const open = await db.query(`select pr.name as practitioner, l.code as location, l.name as location_name, n.number, n.opened_on, n.closed_on, 'on file' as state
                               from provider_numbers n join practitioners pr on pr.id = n.practitioner_id join locations l on l.id = n.location_id
                               order by pr.name, l.code`);
  const gaps = await db.query(`select practitioner, location_code as location, location as location_name, null as number, first_booking as opened_on, null as closed_on, 'MISSING' as state from v_provider_gaps`);
  return [...gaps, ...open];
}, { cols: [
  { key: 'practitioner', label: 'practitioner' }, { key: 'location_name', label: 'location' }, { key: 'number', label: 'provider number' },
  { key: 'state', label: 'state', format: (v, r) => (v === 'MISSING' ? `MISSING, booked from ${d(r.opened_on)}` : r.closed_on ? `closed ${d(r.closed_on)}` : 'open') }] });

cmd('registrations', 'Registration and indemnity dates for every practitioner', async (db) =>
  db.query('select code, name, role, registration_number, registration_expires_on, registration_days, indemnity_expires_on, indemnity_days from v_registrations order by least(registration_days, indemnity_days)'),
  { cols: [{ key: 'name', label: 'practitioner' }, { key: 'role', label: 'role', format: label }, { key: 'registration_number', label: 'registration' },
    { key: 'registration_expires_on', label: 'ends', format: d }, { key: 'registration_days', label: 'days', align: 'right' },
    { key: 'indemnity_expires_on', label: 'indemnity ends', format: d }, { key: 'indemnity_days', label: 'days', align: 'right' }] });

cmd('retention', 'How long each record must be kept, and any disposal set too early (--due shows records past their date)', async (db, pos, f) => {
  if (f.due) return db.query("select code, name, status, last_service_on, keep_until, disposal_on from v_retention where status <> 'active' and keep_until < current_date order by keep_until");
  return db.query('select code, name, status, last_service_on, keep_until, disposal_on from v_retention where disposal_on is not null or status <> \'active\' order by keep_until');
}, { flags: ['due'], cols: [
  { key: 'code', label: 'code' }, { key: 'name', label: 'patient' }, { key: 'status', label: 'status' }, { key: 'last_service_on', label: 'last service', format: d },
  { key: 'keep_until', label: 'keep until', format: d }, { key: 'disposal_on', label: 'disposal set', format: (v, r) => (v ? `${d(v)}${isoDate(v) < isoDate(r.keep_until) ? ' TOO EARLY' : ''}` : '') }] });

cmd('compliance', 'Check the records against the rules in docs/compliance.md (--detail for every item)', async (db) => complianceChecks(db), {
  flags: ['detail'], render: (rows, flags) => {
    const head = table(rows, [{ key: 'status', label: 'status', format: (v) => v.toUpperCase() }, { key: 'rule', label: 'rule', format: (v) => truncate(v, 70) },
      { key: 'breaches', label: 'breaches', align: 'right' }, { key: 'due', label: 'due soon', align: 'right' }, { key: 'source', label: 'source', format: (v) => truncate(v, 55) }]);
    if (!flags.detail) return head;
    const items = rows.flatMap((r) => r.items.map((i) => ({ rule: truncate(r.rule, 40), ...i })));
    return `${head}\n\n${table(items, [{ key: 'rule', label: 'rule' }, { key: 'ref', label: 'ref' }, { key: 'patient', label: 'patient' }, { key: 'detail', label: 'detail' }])}`;
  } });

cmd('attention', 'Everything that needs the front desk or a doctor this week, worst first (--practitioner)', async (db, pos, f) => {
  const name = f.practitioner ? (await db.query('select name from practitioners where id = $1', [await resolve(db, 'practitioner', f.practitioner)]))[0].name : null;
  return db.query('select severity, issue, patient_code, patient, who, on_date, detail from v_attention where ($1::text is null or who = $1) order by severity, on_date nulls first', [name]);
}, { flags: ['practitioner'], cols: [
  { key: 'severity', label: '!', format: (v) => '!'.repeat(4 - v) }, { key: 'issue', label: 'issue' }, { key: 'patient', label: 'patient' }, { key: 'who', label: 'doctor' },
  { key: 'on_date', label: 'date', format: d }, { key: 'detail', label: 'detail', format: (v) => truncate(v, 70) }] });

// ---------------------------------------------------------------- writes

cmd('add-patient', 'Add a patient (--name --born --phone --email --fund --gp)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'name');
  return tx(db, async () => {
    const gp = f.gp ? await resolve(db, 'referrer', f.gp) : null;
    const code = f.code || (await nextCode(db, 'patients', 'PT', 1000));
    const [row] = await db.query(`insert into patients (code, name, born_on, phone, email, health_fund, fund_member_ref, medicare_on_file, usual_gp_id)
                                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning code, name, born_on, health_fund`,
      [code, f.name, date(f.born, '--born'), f.phone || null, f.email || null, f.fund || null, f['fund-ref'] || null, Boolean(f.medicare), gp]);
    await audit(db, by, 'add-patient', 'patient', row.code, { name: row.name });
    return [row];
  });
}, { write: true, flags: ['name', 'born', 'phone', 'email', 'fund', 'fund-ref', 'medicare', 'gp', 'code'] });

cmd('add-referrer', 'Add a referring doctor (--name --kind=gp --practice --suburb --provider --email --phone --prefers)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'name');
  return tx(db, async () => {
    const kind = oneOf(f.kind, ['gp', 'specialist', 'allied_health', 'other'], '--kind') || 'gp';
    const code = f.code || (await nextCode(db, 'referrers', kind === 'gp' ? 'GP' : 'RF', 0)).replace(/-(\d)$/, '-0$1');
    const [row] = await db.query(`insert into referrers (code, name, kind, practice, suburb, provider_number, email, phone, prefers)
                                  values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'secure_message')) returning code, name, kind, practice`,
      [code, f.name, kind, f.practice || null, f.suburb || null, f.provider || null, f.email || null, f.phone || null, oneOf(f.prefers, ['secure_message', 'email', 'fax', 'post'], '--prefers')]);
    await audit(db, by, 'add-referrer', 'referrer', row.code, row);
    return [row];
  });
}, { write: true, flags: ['name', 'kind', 'practice', 'suburb', 'provider', 'email', 'phone', 'prefers', 'code'] });

cmd('add-referral', 'Record a referral for a patient (--from --to --issued --months --indefinite --reason --urgency)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'to', 'issued');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const referrer = f.from ? await resolve(db, 'referrer', f.from) : null;
    const code = await nextCode(db, 'referrals', 'REF', 2000);
    const [row] = await db.query(`insert into referrals (code, patient_id, referrer_id, practitioner_id, issued_on, valid_months, indefinite, reason, urgency, admitted)
                                  values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'routine'), $10) returning code, issued_on, valid_months, indefinite, urgency, status`,
      [code, patient, referrer, await resolve(db, 'practitioner', f.to), date(f.issued, '--issued'), int(f.months, '--months', 1, 60), Boolean(f.indefinite),
       f.reason || null, oneOf(f.urgency, ['urgent', 'soon', 'routine'], '--urgency'), Boolean(f.admitted)]);
    await audit(db, by, 'add-referral', 'referral', row.code, row);
    return [{ patient: await codeOf(db, 'patients', patient), ...row }];
  });
}, { write: true, flags: ['from', 'to', 'issued', 'months', 'indefinite', 'reason', 'urgency', 'admitted'] });

cmd('triage', 'Triage a referral (--urgency, --status=triaged|declined, --note)', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'referral', pos[0]);
    const [row] = await db.query(`update referrals set urgency = coalesce($2, urgency), status = coalesce($3, 'triaged'), reason = coalesce(reason || '. ' || $4, reason)
                                  where id = $1 returning code, urgency, status`,
      [id, oneOf(f.urgency, ['urgent', 'soon', 'routine'], '--urgency'), oneOf(f.status, ['triaged', 'declined'], '--status'), f.note || null]);
    await audit(db, by, 'triage', 'referral', row.code, row);
    return [row];
  });
}, { write: true, flags: ['urgency', 'status', 'note'] });

cmd('book', 'Book an appointment (--with --at=YYYY-MM-DD --time=09:30 --location --kind --minutes --note)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'with', 'at', 'time', 'location');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const practitioner = await resolve(db, 'practitioner', f.with);
    const location = await resolve(db, 'location', f.location);
    const kind = oneOf(f.kind, ['initial', 'review', 'pre_op', 'post_op', 'procedure', 'telehealth'], '--kind') || 'review';
    const starts = `${date(f.at, '--at')} ${time(f.time, '--time')}`;
    const clash = await db.query(`select code from appointments where practitioner_id = $1 and status = 'booked'
                                  and tstzrange(starts_at, starts_at + make_interval(mins => minutes)) && tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3::int))`,
      [practitioner, starts, int(f.minutes ?? (kind === 'initial' ? 45 : 20), '--minutes', 5, 600)]);
    if (clash.length && !f.double) throw new Error(`That time overlaps ${clash.map((c) => c.code).join(', ')}. Pick another time or pass --double`);
    const ref = (await db.query(`select id from referrals where patient_id = $1 and practitioner_id = $2 and status not in ('declined', 'closed') order by issued_on desc limit 1`, [patient, practitioner]))[0]?.id || null;
    const code = await nextCode(db, 'appointments', 'AP', 3000);
    const [row] = await db.query(`insert into appointments (code, patient_id, practitioner_id, location_id, referral_id, starts_at, minutes, kind, note)
                                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, code, starts_at, kind, minutes`,
      [code, patient, practitioner, location, ref, starts, int(f.minutes ?? (kind === 'initial' ? 45 : 20), '--minutes', 5, 600), kind, f.note || null]);
    if (ref) await db.query("update referrals set status = 'booked' where id = $1 and status in ('received', 'triaged')", [ref]);
    const [cover] = await db.query('select cover, valid_until from v_referral_cover where id = $1', [row.id]);
    await audit(db, by, 'book', 'appointment', row.code, { starts: row.starts_at, kind });
    return [{ appointment: row.code, patient: await codeOf(db, 'patients', patient), starts_at: row.starts_at, kind, referral: cover?.cover || 'not needed' }];
  });
}, { write: true, flags: ['with', 'at', 'time', 'location', 'kind', 'minutes', 'note', 'double'] });

cmd('attend', 'Close an appointment: --status=attended|dna|cancelled, --item --fee; an attended consult opens the letter to the referrer', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'appointment', pos[0]);
    const p = await policy(db);
    const status = oneOf(f.status, ['attended', 'did_not_attend', 'cancelled'], '--status') || 'attended';
    const [a] = await db.query(`update appointments set status = $2, item_number = coalesce($3, item_number), fee_cents = coalesce($4, fee_cents)
                                where id = $1 returning code, patient_id, practitioner_id, referral_id, kind, starts_at::date as on_date`,
      [id, status, f.item ? String(f.item) : null, cents(f.fee, '--fee')]);
    let letter = null;
    if (status === 'attended') {
      if (a.referral_id) await db.query("update referrals set first_seen_on = coalesce(first_seen_on, $2), status = 'active' where id = $1", [a.referral_id, a.on_date]);
      if (['initial', 'pre_op', 'post_op'].includes(a.kind) || f.letter) {
        const referrer = (await db.query('select referrer_id from referrals where id = $1', [a.referral_id]))[0]?.referrer_id
          || (await db.query('select usual_gp_id from patients where id = $1', [a.patient_id]))[0].usual_gp_id;
        letter = await nextCode(db, 'letters', 'LT', 5000);
        await db.query(`insert into letters (code, patient_id, practitioner_id, referrer_id, appointment_id, kind, due_on)
                        values ($1, $2, $3, $4, $5, $6, ($7::date + $8::int))`,
          [letter, a.patient_id, a.practitioner_id, referrer, id, a.kind === 'initial' ? 'consult' : 'progress', a.on_date, p.letter_days]);
      }
    }
    await audit(db, by, 'attend', 'appointment', a.code, { status, item: f.item, letter });
    return [{ appointment: a.code, status, item: f.item || '', letter_owed: letter || '' }];
  });
}, { write: true, flags: ['status', 'item', 'fee', 'letter'] });

cmd('plan', 'Plan a procedure (--surgeon --hospital --procedure --date --fee --rebate --anaesthetist --urgency; no --date puts it on the waitlist)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'surgeon', 'hospital', 'procedure');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const code = await nextCode(db, 'procedures', 'PX', 4000);
    const on = date(f.date, '--date');
    const [row] = await db.query(`insert into procedures (code, patient_id, practitioner_id, anaesthetist_id, location_id, procedure, item_numbers, planned_on, status, urgency, fee_cents, rebate_estimate_cents, note)
                                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, 'routine'), coalesce($11, 0), coalesce($12, 0), $13)
                                  returning code, procedure, planned_on, status, fee_cents, rebate_estimate_cents`,
      [code, patient, await resolve(db, 'practitioner', f.surgeon), f.anaesthetist ? await resolve(db, 'practitioner', f.anaesthetist) : null,
       await resolve(db, 'location', f.hospital), f.procedure, f.items || null, on, on ? 'planned' : 'waitlist',
       oneOf(f.urgency, ['urgent', 'soon', 'routine'], '--urgency'), cents(f.fee, '--fee'), cents(f.rebate, '--rebate'), f.note || null]);
    await audit(db, by, 'plan', 'procedure', row.code, { procedure: row.procedure, planned_on: row.planned_on });
    return [{ ...row, next: 'Send the fee estimate: npm run docs -- fee-estimate, then consent --given' }];
  });
}, { write: true, flags: ['surgeon', 'hospital', 'procedure', 'items', 'date', 'fee', 'rebate', 'anaesthetist', 'urgency', 'note'] });

cmd('schedule', 'Change a procedure: --date, --status=booked|done|cancelled|waitlist, --hospital-booked', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'procedure', pos[0]);
    const status = oneOf(f.status, ['waitlist', 'planned', 'booked', 'done', 'cancelled'], '--status');
    const [cur] = await db.query('select ifc_signed_on, planned_on from procedures where id = $1', [id]);
    if (status === 'booked' && !cur.ifc_signed_on && !f.override) throw new Error('No signed fee estimate on file. Record consent --signed first, or pass --override with --reason');
    if (f.override) need(f, 'reason');
    const [row] = await db.query(`update procedures set planned_on = coalesce($2, planned_on), status = coalesce($3, status),
                                  hospital_booked_on = case when $4 then coalesce(hospital_booked_on, current_date) else hospital_booked_on end
                                  where id = $1 returning code, procedure, planned_on, status, hospital_booked_on`,
      [id, date(f.date, '--date'), status, Boolean(f['hospital-booked'])]);
    await audit(db, by, 'schedule', 'procedure', row.code, { status: row.status, planned_on: row.planned_on, override: f.override ? f.reason : undefined });
    return [row];
  });
}, { write: true, flags: ['date', 'status', 'hospital-booked', 'override', 'reason'] });

cmd('consent', 'Record the fee estimate: --given (sent to the patient) and/or --signed (signed copy back), --on', async (db, pos, f) => {
  const by = actor(f);
  if (!f.given && !f.signed) throw new Error('Say --given, --signed or both');
  return tx(db, async () => {
    const id = await resolve(db, 'procedure', pos[0]);
    const on = date(f.on, '--on') || isoDate(new Date());
    const [row] = await db.query(`update procedures set ifc_given_on = case when $2 then $4::date else coalesce(ifc_given_on, case when $3 then $4::date end) end,
                                  ifc_signed_on = case when $3 then $4::date else ifc_signed_on end where id = $1
                                  returning code, procedure, planned_on, ifc_given_on, ifc_signed_on`, [id, Boolean(f.given), Boolean(f.signed), on]);
    await audit(db, by, 'consent', 'procedure', row.code, { given: row.ifc_given_on, signed: row.ifc_signed_on });
    return [row];
  });
}, { write: true, flags: ['given', 'signed', 'on'] });

cmd('letter-sent', 'Mark a letter to the referrer sent (--on, --dictated, --summary)', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'letter', pos[0]);
    const on = date(f.on, '--on') || isoDate(new Date());
    const [row] = await db.query(`update letters set sent_on = $2, dictated_on = coalesce($3, dictated_on, $2), summary = coalesce($4, summary)
                                  where id = $1 returning code, kind, due_on, sent_on`, [id, on, date(f.dictated, '--dictated'), f.summary || null]);
    await audit(db, by, 'letter-sent', 'letter', row.code, row);
    return [row];
  });
}, { write: true, flags: ['on', 'dictated', 'summary'] });

cmd('add-result', 'File a result against a patient (--test --doctor --provider --abnormal --on)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'test', 'doctor');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const [row] = await db.query(`insert into results (patient_id, practitioner_id, test, provider, received_on, abnormal) values ($1, $2, $3, $4, coalesce($5, current_date), $6)
                                  returning test, received_on, abnormal`,
      [patient, await resolve(db, 'practitioner', f.doctor), f.test, f.provider || null, date(f.on, '--on'), Boolean(f.abnormal)]);
    await audit(db, by, 'add-result', 'patient', await codeOf(db, 'patients', patient), row);
    return [row];
  });
}, { write: true, flags: ['test', 'doctor', 'provider', 'abnormal', 'on'] });

cmd('review-result', 'Mark a patient\'s oldest unreviewed result (or --test="part of its name") reviewed, with --action', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'action');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const rows = await db.query(`select id, test from results where patient_id = $1 and reviewed_on is null and ($2::text is null or test ilike '%' || $2 || '%') order by received_on`,
      [patient, f.test ? String(f.test) : null]);
    if (!rows.length) throw new Error('No unreviewed result matches');
    await db.query('update results set reviewed_on = current_date, action = $2 where id = $1', [rows[0].id, f.action]);
    await audit(db, by, 'review-result', 'patient', await codeOf(db, 'patients', patient), { test: rows[0].test, action: f.action });
    return [{ patient: await codeOf(db, 'patients', patient), test: rows[0].test, action: f.action }];
  });
}, { write: true, flags: ['test', 'action'] });

cmd('recall', 'Set a recall (--with --due --reason), or close one with --done', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const code = await codeOf(db, 'patients', patient);
    if (f.done) {
      const rows = await db.query('select id, reason from recalls where patient_id = $1 and done_on is null order by due_on', [patient]);
      if (!rows.length) throw new Error('No open recall for that patient');
      await db.query('update recalls set done_on = current_date where id = $1', [rows[0].id]);
      await audit(db, by, 'recall-done', 'patient', code, { reason: rows[0].reason });
      return [{ patient: code, closed: rows[0].reason }];
    }
    need(f, 'with', 'due', 'reason');
    const [row] = await db.query('insert into recalls (patient_id, practitioner_id, due_on, reason) values ($1, $2, $3, $4) returning due_on, reason',
      [patient, await resolve(db, 'practitioner', f.with), date(f.due, '--due'), f.reason]);
    await audit(db, by, 'recall', 'patient', code, row);
    return [{ patient: code, ...row }];
  });
}, { write: true, flags: ['with', 'due', 'reason', 'done'] });

cmd('invoice', 'Raise an account (--amount --payer --appointment --procedure --note)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'amount');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    const code = await nextCode(db, 'invoices', 'INV', 6000);
    const [row] = await db.query(`insert into invoices (code, patient_id, appointment_id, procedure_id, payer, amount_cents, note)
                                  values ($1, $2, $3, $4, coalesce($5, 'patient'), $6, $7) returning code, payer, amount_cents, issued_on`,
      [code, patient, f.appointment ? await resolve(db, 'appointment', f.appointment) : null, f.procedure ? await resolve(db, 'procedure', f.procedure) : null,
       oneOf(f.payer, ['patient', 'health_fund', 'medicare', 'third_party', 'workers_comp'], '--payer'), cents(f.amount, '--amount'), f.note || null]);
    await audit(db, by, 'invoice', 'invoice', row.code, row);
    return [row];
  });
}, { write: true, flags: ['amount', 'payer', 'appointment', 'procedure', 'note'] });

cmd('pay', 'Record a payment against an account (--amount, or --write-off with --reason)', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'invoice', pos[0]);
    if (f['write-off']) {
      need(f, 'reason');
      const [row] = await db.query("update invoices set status = 'written_off', note = coalesce(note || '. ', '') || $2 where id = $1 returning code, status", [id, `Written off: ${f.reason}`]);
      await audit(db, by, 'write-off', 'invoice', row.code, { reason: f.reason });
      return [row];
    }
    need(f, 'amount');
    const [row] = await db.query(`update invoices set paid_cents = paid_cents + $2, status = case when paid_cents + $2 >= amount_cents then 'paid' else status end
                                  where id = $1 returning code, amount_cents, paid_cents, status`, [id, cents(f.amount, '--amount')]);
    await audit(db, by, 'pay', 'invoice', row.code, { amount: f.amount });
    return [row];
  });
}, { write: true, flags: ['amount', 'write-off', 'reason'] });

cmd('note', 'Add a clinical note to a patient (--text, --doctor, --appointment)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'text');
  return tx(db, async () => {
    const patient = await resolve(db, 'patient', pos.join(' '));
    await db.query('insert into clinical_notes (patient_id, practitioner_id, appointment_id, note) values ($1, $2, $3, $4)',
      [patient, f.doctor ? await resolve(db, 'practitioner', f.doctor) : null, f.appointment ? await resolve(db, 'appointment', f.appointment) : null, f.text]);
    await audit(db, by, 'note', 'patient', await codeOf(db, 'patients', patient), {});
    return [{ patient: await codeOf(db, 'patients', patient), noted: truncate(f.text, 60) }];
  });
}, { write: true, flags: ['text', 'doctor', 'appointment'] });

cmd('log', 'Log a call, email or visit with a patient or a referrer (--referrer instead of a patient, --kind, --summary)', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'summary');
  return tx(db, async () => {
    const referrer = f.referrer ? await resolve(db, 'referrer', f.referrer) : null;
    const patient = referrer ? null : await resolve(db, 'patient', pos.join(' '));
    const [row] = await db.query(`insert into contacts_log (patient_id, referrer_id, kind, summary, by_name, happened_on) values ($1, $2, coalesce($3, 'call'), $4, $5, coalesce($6, current_date))
                                  returning kind, happened_on`, [patient, referrer, oneOf(f.kind, ['call', 'email', 'sms', 'letter', 'visit'], '--kind'), f.summary, by, date(f.on, '--on')]);
    await audit(db, by, 'log', referrer ? 'referrer' : 'patient', referrer ? await codeOf(db, 'referrers', referrer) : await codeOf(db, 'patients', patient), row);
    return [{ ...row, summary: truncate(f.summary, 60) }];
  });
}, { write: true, flags: ['referrer', 'kind', 'summary', 'on'] });

cmd('provider-number', 'Record a provider number (--practitioner --location --number --opened), or --close one', async (db, pos, f) => {
  const by = actor(f);
  need(f, 'practitioner', 'location');
  return tx(db, async () => {
    const practitioner = await resolve(db, 'practitioner', f.practitioner);
    const location = await resolve(db, 'location', f.location);
    if (f.close) {
      const rows = await db.query('update provider_numbers set closed_on = coalesce($3, current_date) where practitioner_id = $1 and location_id = $2 and closed_on is null returning number, closed_on',
        [practitioner, location, date(f.on, '--on')]);
      if (!rows.length) throw new Error('No open provider number there');
      await audit(db, by, 'provider-number-close', 'provider_number', rows[0].number, {});
      return rows;
    }
    need(f, 'number');
    const [row] = await db.query('insert into provider_numbers (practitioner_id, location_id, number, opened_on) values ($1, $2, $3, coalesce($4, current_date)) returning number, opened_on',
      [practitioner, location, String(f.number).toUpperCase(), date(f.opened, '--opened')]);
    await audit(db, by, 'provider-number', 'provider_number', row.number, {});
    return [row];
  });
}, { write: true, flags: ['practitioner', 'location', 'number', 'opened', 'close', 'on'] });

cmd('renew', 'Record a renewed registration or indemnity for a practitioner (--registration=YYYY-MM-DD, --indemnity=YYYY-MM-DD)', async (db, pos, f) => {
  const by = actor(f);
  if (!f.registration && !f.indemnity) throw new Error('Give --registration and/or --indemnity with the new end date');
  return tx(db, async () => {
    const id = await resolve(db, 'practitioner', pos.join(' '));
    const [row] = await db.query(`update practitioners set registration_expires_on = coalesce($2, registration_expires_on), indemnity_expires_on = coalesce($3, indemnity_expires_on)
                                  where id = $1 returning code, name, registration_expires_on, indemnity_expires_on`, [id, date(f.registration, '--registration'), date(f.indemnity, '--indemnity')]);
    await audit(db, by, 'renew', 'practitioner', row.code, row);
    return [row];
  });
}, { write: true, flags: ['registration', 'indemnity'] });

cmd('dispose', 'Set or clear the disposal date on a discharged patient\'s record (--on, --clear). Refuses a date inside the retention period', async (db, pos, f) => {
  const by = actor(f);
  return tx(db, async () => {
    const id = await resolve(db, 'patient', pos.join(' '));
    const on = f.clear ? null : date(f.on, '--on');
    if (!f.clear && !on) throw new Error('Give --on=YYYY-MM-DD or --clear');
    const [r] = await db.query('select code, status, keep_until from v_retention where id = $1', [id]);
    if (on && r.status === 'active') throw new Error(`${r.code} is an active patient`);
    if (on && r.keep_until && on < isoDate(r.keep_until)) throw new Error(`${r.code} must be kept until ${isoDate(r.keep_until)}`);
    await db.query('update patients set disposal_on = $2 where id = $1', [id, on]);
    await audit(db, by, 'dispose', 'patient', r.code, { disposal_on: on });
    return [{ patient: r.code, disposal_on: on, keep_until: r.keep_until }];
  });
}, { write: true, flags: ['on', 'clear'] });

// ---------------------------------------------------------------- import and export

// Gentu report exports vary with the columns ticked. These are the header names it and most
// practice systems use; anything else, map with Claude Code before running the import.
cmd('import', 'Bring records across: import gentu --patients=<csv> [--appointments=<csv>] [--referrers=<csv>] [--dry-run]', async (db, pos, f) => {
  if (pos[0] !== 'gentu') throw new Error('Usage: import gentu --patients=<csv> [--appointments=<csv>] [--referrers=<csv>] [--dry-run] --by=<name>');
  const by = actor(f);
  need(f, 'patients');
  const read = (file) => parseCsv(readFileSync(path.resolve(String(file)), 'utf8'));
  const out = { patients_new: 0, patients_matched: 0, referrers_new: 0, practitioners_new: 0, locations_new: 0, appointments_new: 0, appointments_matched: 0, skipped: [] };
  const findOrAdd = async (table, prefix, name, extra = {}) => {
    const hit = (await db.query(`select id from ${table} where lower(name) = lower($1)`, [name]))[0];
    if (hit) return hit.id;
    const code = await nextCode(db, table, prefix, 0);
    const cols = ['code', 'name', ...Object.keys(extra)];
    const [row] = await db.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, [code, name, ...Object.values(extra)]);
    out[`${table}_new`]++;
    return row.id;
  };
  const run = async () => {
    for (const r of f.referrers ? read(f.referrers) : []) {
      const name = pick(r, 'Name', 'Referrer', 'Referrer Name', 'Doctor');
      if (name) await findOrAdd('referrers', 'RF', name, { practice: pick(r, 'Practice', 'Practice Name', 'Clinic') || null, provider_number: pick(r, 'Provider Number', 'Provider No') || null, email: pick(r, 'Email') || null });
    }
    const byRef = new Map();
    for (const r of read(f.patients)) {
      const ref = pick(r, 'Patient ID', 'PatientID', 'ID', 'Patient Number', 'MRN');
      const name = pick(r, 'Name', 'Patient Name', 'Full Name') || [pick(r, 'First Name', 'Given Name', 'FirstName'), pick(r, 'Last Name', 'Surname', 'Family Name', 'LastName')].filter(Boolean).join(' ');
      if (!ref || !name) { out.skipped.push(`patient row without an id or name: ${JSON.stringify(r).slice(0, 80)}`); continue; }
      const hit = (await db.query('select id from patients where source_ref = $1', [`gentu:${ref}`]))[0];
      if (hit) { byRef.set(ref, hit.id); out.patients_matched++; continue; }
      const gpName = pick(r, 'Usual GP', 'GP', 'Referring Doctor', 'Referrer');
      const gp = gpName ? await findOrAdd('referrers', 'RF', gpName) : null;
      const [row] = await db.query(`insert into patients (code, name, born_on, phone, email, health_fund, fund_member_ref, medicare_on_file, usual_gp_id, source_ref)
                                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [`GT-${String(ref).replace(/[^A-Za-z0-9]/g, '').slice(-8)}`, name, date(pick(r, 'Date of Birth', 'DOB', 'Birth Date'), 'date of birth'),
         pick(r, 'Mobile', 'Mobile Phone', 'Phone', 'Home Phone') || null, pick(r, 'Email', 'Email Address') || null,
         pick(r, 'Health Fund', 'Health Fund Name', 'Fund') || null, pick(r, 'Health Fund Number', 'Fund Number', 'Membership Number') || null,
         Boolean(pick(r, 'Medicare Number', 'Medicare No', 'Medicare')), gp, `gentu:${ref}`]);
      byRef.set(ref, row.id);
      out.patients_new++;
    }
    for (const r of f.appointments ? read(f.appointments) : []) {
      const ref = pick(r, 'Appointment ID', 'AppointmentID', 'ID');
      const pref = pick(r, 'Patient ID', 'PatientID', 'Patient Number', 'MRN');
      const patient = byRef.get(pref) || (await db.query('select id from patients where source_ref = $1', [`gentu:${pref}`]))[0]?.id;
      if (!patient) { out.skipped.push(`appointment ${ref || '(no id)'}: patient ${pref || '(blank)'} not imported`); continue; }
      if (ref && (await db.query('select 1 from appointments where source_ref = $1', [`gentu:${ref}`])).length) { out.appointments_matched++; continue; }
      const who = pick(r, 'Practitioner', 'Provider', 'Doctor', 'Clinician');
      const where = pick(r, 'Location', 'Site', 'Clinic') || 'Main rooms';
      const on = date(pick(r, 'Appointment Date', 'Date', 'Start Date'), 'appointment date');
      if (!who || !on) { out.skipped.push(`appointment ${ref || '(no id)'}: no practitioner or date`); continue; }
      const t = time(pick(r, 'Start Time', 'Time', 'Start') || '09:00', 'start time');
      const st = String(pick(r, 'Status', 'Appointment Status') || '').toLowerCase();
      const status = /did not|dna|no.?show|failed/.test(st) ? 'did_not_attend' : /cancel/.test(st) ? 'cancelled' : on < isoDate(new Date()) ? 'attended' : 'booked';
      const type = String(pick(r, 'Appointment Type', 'Type') || '').toLowerCase();
      const kind = /new|initial|first/.test(type) ? 'initial' : /pre.?op/.test(type) ? 'pre_op' : /post.?op/.test(type) ? 'post_op' : /tele|video|phone/.test(type) ? 'telehealth' : /procedure|surgery|theatre/.test(type) ? 'procedure' : 'review';
      await db.query(`insert into appointments (code, patient_id, practitioner_id, location_id, starts_at, minutes, kind, status, item_number, fee_cents, source_ref, note)
                      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [await nextCode(db, 'appointments', 'AP', 3000), patient, await findOrAdd('practitioners', 'DR', who), await findOrAdd('locations', 'LOC', where),
         `${on} ${t}`, int(pick(r, 'Duration', 'Length', 'Minutes') || 20, 'duration', 1, 600), kind, status,
         pick(r, 'Item Number', 'Item', 'MBS Item') || null, cents(pick(r, 'Fee', 'Amount', 'Charged') || null, 'fee'), ref ? `gentu:${ref}` : null, pick(r, 'Notes', 'Comment') || null]);
      out.appointments_new++;
    }
    await audit(db, by, f['dry-run'] ? 'import-dry-run' : 'import', 'import', 'gentu', { ...out, skipped: out.skipped.length });
  };
  await db.exec('BEGIN');
  try {
    await run();
    await db.exec(f['dry-run'] ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  return [{ mode: f['dry-run'] ? 'dry run, nothing saved' : 'imported', ...out, skipped: out.skipped.length, skipped_detail: out.skipped }];
}, { write: true, flags: ['patients', 'appointments', 'referrers', 'dry-run'], cols: [
  { key: 'mode', label: 'mode' }, { key: 'patients_new', label: 'new patients', align: 'right' }, { key: 'patients_matched', label: 'already here', align: 'right' },
  { key: 'referrers_new', label: 'new referrers', align: 'right' }, { key: 'practitioners_new', label: 'new practitioners', align: 'right' },
  { key: 'appointments_new', label: 'new appointments', align: 'right' }, { key: 'skipped', label: 'skipped', align: 'right' }] });

const EXPORT_TABLES = ['practitioners', 'locations', 'provider_numbers', 'referrers', 'patients', 'referrals', 'appointments', 'procedures', 'letters',
  'results', 'recalls', 'invoices', 'clinical_notes', 'contacts_log', 'policy', 'audit'];

cmd('export', 'Write every table to CSV (--out=exports/<date>)', async (db, pos, f) => {
  const dir = path.resolve(REPO_ROOT, typeof f.out === 'string' ? f.out : path.join('exports', isoDate(new Date())));
  mkdirSync(dir, { recursive: true });
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [];
  for (const t of EXPORT_TABLES) {
    const rows = await db.query(`select * from ${t}`);
    const cols = rows.length ? Object.keys(rows[0]) : (await db.query('select column_name from information_schema.columns where table_name = $1 order by ordinal_position', [t])).map((r) => r.column_name);
    writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n');
    out.push({ table: t, rows: rows.length, file: path.relative(REPO_ROOT, path.join(dir, `${t}.csv`)) });
  }
  return out;
}, { flags: ['out'] });

export const commands = Object.keys(C);

// ---------------------------------------------------------------- output

function renderShow(r) {
  const p = r.patient;
  const age = p.born_on ? Math.floor((Date.now() - new Date(p.born_on).getTime()) / (365.25 * 86400000)) : null;
  const lines = [heading(`${p.code}  ${p.name}`),
    `  ${age !== null ? `${age} years` : 'age not recorded'}. ${p.health_fund ? `${p.health_fund} ${p.fund_member_ref || ''}`.trim() : 'No health fund'}. Medicare ${p.medicare_on_file ? 'on file' : 'NOT on file'}. GP: ${p.gp ? `${p.gp}, ${p.gp_practice}` : 'none'}. Status: ${p.status}.`];
  if (p.notes) lines.push(`  ${p.notes}`);
  if (r.retention?.disposal_on) lines.push(`  Disposal set for ${isoDate(r.retention.disposal_on)}; record must be kept until ${isoDate(r.retention.keep_until)}.`);
  const block = (title, rows, cols) => { if (rows.length) lines.push(`\n${title}`, table(rows, cols)); };
  block('Referrals', r.referrals, [{ key: 'code', label: 'referral' }, { key: 'referrer', label: 'from' }, { key: 'practitioner', label: 'to' },
    { key: 'first_seen_on', label: 'first seen', format: d }, { key: 'valid_until', label: 'valid until', format: (v, x) => (x.indefinite ? 'indefinite' : d(v)) }, { key: 'status', label: 'status' }]);
  block('Appointments', r.appointments, [{ key: 'starts_at', label: 'when', format: (v) => (v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v) },
    { key: 'practitioner', label: 'with' }, { key: 'location', label: 'where' }, { key: 'kind', label: 'type', format: label }, { key: 'status', label: 'status', format: label }, { key: 'item_number', label: 'item' }]);
  block('Procedures', r.procedures, [{ key: 'code', label: 'code' }, { key: 'procedure', label: 'procedure', format: (v) => truncate(v, 34) }, { key: 'planned_on', label: 'date', format: d },
    { key: 'status', label: 'status' }, { key: 'gap_cents', label: 'est. gap', align: 'right', format: (v) => money(v) },
    { key: 'ifc_signed_on', label: 'consent', format: (v, x) => (v ? `signed ${d(v)}` : x.ifc_given_on ? 'sent, unsigned' : 'none') }]);
  block('Letters to referrers', r.letters, [{ key: 'code', label: 'letter' }, { key: 'kind', label: 'kind' }, { key: 'due_on', label: 'due', format: d }, { key: 'sent_on', label: 'sent', format: (v) => (v ? d(v) : 'NOT SENT') }]);
  block('Results', r.results, [{ key: 'test', label: 'test' }, { key: 'received_on', label: 'received', format: d }, { key: 'abnormal', label: 'flag', format: (v) => (v ? 'abnormal' : '') },
    { key: 'reviewed_on', label: 'reviewed', format: (v, x) => (v ? `${d(v)}: ${x.action || ''}` : 'NOT REVIEWED') }]);
  block('Recalls', r.recalls, [{ key: 'due_on', label: 'due', format: d }, { key: 'reason', label: 'reason' }, { key: 'done_on', label: 'done', format: d }]);
  block('Accounts', r.invoices, [{ key: 'code', label: 'account' }, { key: 'payer', label: 'payer', format: label }, { key: 'issued_on', label: 'issued', format: d },
    { key: 'amount_cents', label: 'amount', align: 'right', format: (v) => money(v) }, { key: 'paid_cents', label: 'paid', align: 'right', format: (v) => money(v) }, { key: 'status', label: 'status' }]);
  block('Latest notes', r.notes, [{ key: 'written_on', label: 'date', format: d }, { key: 'note', label: 'note', format: (v) => truncate(v, 90) }]);
  return lines.join('\n');
}

export function format(name, result, flags = {}) {
  const c = C[name];
  if (c.render) return c.render(result, flags);
  const cols = c.cols || (result[0] ? Object.keys(result[0]).filter((k) => typeof result[0][k] !== 'object' || result[0][k] === null || result[0][k] instanceof Date).map((k) => ({ key: k, label: k })) : []);
  const dated = cols.map((col) => (col.format ? col : { ...col, format: (v) => (v instanceof Date ? isoDate(v) : v) }));
  return table(result, dated);
}

export async function run(db, argv) {
  const { pos, flags } = parseArgs(argv);
  const name = pos.shift();
  if (!name) throw new Error('Name a command. Try: help');
  const c = C[name];
  if (!c) throw new Error(`Unknown command "${name}". Try: help`);
  const allowed = new Set([...(c.flags || []), 'json', ...(c.write ? ['by'] : [])]);
  for (const k of Object.keys(flags)) if (!allowed.has(k)) throw new Error(`Unknown flag --${k} for ${name}`);
  return c.fn(db, pos, flags);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const { pos, flags } = parseArgs(argv);
  const db = await getDb();
  try {
    const result = await run(db, argv);
    if (flags.json) console.log(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
    else console.log(format(pos[0], result, flags));
  } catch (e) {
    console.error(e.message);
    if (e.candidates) for (const c of e.candidates) console.error(`  ${c.label}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

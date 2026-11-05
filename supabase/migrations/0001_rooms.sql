-- Specialist Practice for Claude Code: the front office of a specialist medical practice.
-- Practitioners and their registration, locations and provider numbers, referrers and referrals,
-- patients, appointments, procedures with informed financial consent, letters back to referrers,
-- results to review, recalls, accounts and clinical notes.
-- Plain Postgres. Runs the same on PGlite. Money is stored in cents.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Practice rules the views read. Change a value here, every view and check follows.
create table policy (
  key text primary key,
  value integer not null,
  note text not null
);

create table practitioners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  role text not null default 'specialist' check (role in ('specialist', 'anaesthetist', 'nurse', 'allied_health', 'admin')),
  specialty text,
  registration_number text,
  registration_expires_on date,
  indemnity_expires_on date,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'rooms' check (kind in ('rooms', 'private_hospital', 'day_surgery', 'public_hospital', 'telehealth')),
  suburb text,
  state text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One provider number for each practitioner at each location they practise from.
create table provider_numbers (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references practitioners(id),
  location_id uuid not null references locations(id),
  number text not null,
  opened_on date,
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practitioner_id, location_id, number)
);

create table referrers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'gp' check (kind in ('gp', 'specialist', 'allied_health', 'other')),
  practice text,
  suburb text,
  provider_number text,
  email text,
  phone text,
  prefers text not null default 'secure_message' check (prefers in ('secure_message', 'email', 'fax', 'post')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  born_on date,
  phone text,
  email text,
  health_fund text,
  fund_member_ref text,
  medicare_on_file boolean not null default false,
  usual_gp_id uuid references referrers(id),
  status text not null default 'active' check (status in ('active', 'discharged', 'deceased', 'transferred')),
  disposal_on date,
  source_ref text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A referral is valid from the first consultation. valid_months null means the default for its
-- kind (policy: referral_months_gp, referral_months_specialist); indefinite means no end date.
create table referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references patients(id),
  referrer_id uuid references referrers(id),
  practitioner_id uuid not null references practitioners(id),
  issued_on date not null,
  first_seen_on date,
  valid_months integer check (valid_months is null or valid_months between 1 and 60),
  indefinite boolean not null default false,
  admitted boolean not null default false,
  reason text,
  status text not null default 'received' check (status in ('received', 'triaged', 'booked', 'active', 'closed', 'declined')),
  urgency text not null default 'routine' check (urgency in ('urgent', 'soon', 'routine')),
  received_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references patients(id),
  practitioner_id uuid not null references practitioners(id),
  location_id uuid not null references locations(id),
  referral_id uuid references referrals(id),
  starts_at timestamptz not null,
  minutes integer not null default 30,
  kind text not null default 'review' check (kind in ('initial', 'review', 'pre_op', 'post_op', 'procedure', 'telehealth')),
  status text not null default 'booked' check (status in ('booked', 'attended', 'did_not_attend', 'cancelled')),
  item_number text,
  fee_cents bigint,
  source_ref text unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Procedures and surgical bookings, with the informed financial consent that has to come first.
create table procedures (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references patients(id),
  practitioner_id uuid not null references practitioners(id),
  anaesthetist_id uuid references practitioners(id),
  location_id uuid not null references locations(id),
  procedure text not null,
  item_numbers text,
  planned_on date,
  status text not null default 'planned' check (status in ('waitlist', 'planned', 'booked', 'done', 'cancelled')),
  urgency text not null default 'routine' check (urgency in ('urgent', 'soon', 'routine')),
  fee_cents bigint not null default 0,
  rebate_estimate_cents bigint not null default 0,
  ifc_given_on date,
  ifc_signed_on date,
  hospital_booked_on date,
  added_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Letters owed to the referring doctor after a consultation or procedure.
create table letters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references patients(id),
  practitioner_id uuid not null references practitioners(id),
  referrer_id uuid references referrers(id),
  appointment_id uuid references appointments(id),
  procedure_id uuid references procedures(id),
  kind text not null default 'consult' check (kind in ('consult', 'progress', 'operation', 'discharge')),
  due_on date not null,
  dictated_on date,
  sent_on date,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  practitioner_id uuid not null references practitioners(id),
  test text not null,
  provider text,
  received_on date not null default current_date,
  abnormal boolean not null default false,
  reviewed_on date,
  action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recalls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  practitioner_id uuid not null references practitioners(id),
  due_on date not null,
  reason text not null,
  done_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Accounts: what the patient, fund or third party owes after the rebate.
create table invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references patients(id),
  appointment_id uuid references appointments(id),
  procedure_id uuid references procedures(id),
  payer text not null default 'patient' check (payer in ('patient', 'health_fund', 'medicare', 'third_party', 'workers_comp')),
  issued_on date not null default current_date,
  amount_cents bigint not null,
  paid_cents bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'written_off')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clinical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  practitioner_id uuid references practitioners(id),
  appointment_id uuid references appointments(id),
  written_on date not null default current_date,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts_log (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  referrer_id uuid references referrers(id),
  happened_on date not null default current_date,
  kind text not null default 'call' check (kind in ('call', 'email', 'sms', 'letter', 'visit')),
  summary text not null,
  by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text not null,
  ref text,
  detail jsonb not null default '{}'::jsonb
);

create index on appointments (starts_at);
create index on appointments (patient_id);
create index on referrals (patient_id);
create index on procedures (planned_on);
create index on letters (due_on) where sent_on is null;
create index on results (received_on) where reviewed_on is null;
create index on invoices (patient_id) where status = 'open';

create trigger touch_practitioners before update on practitioners for each row execute function touch_updated_at();
create trigger touch_locations before update on locations for each row execute function touch_updated_at();
create trigger touch_provider_numbers before update on provider_numbers for each row execute function touch_updated_at();
create trigger touch_referrers before update on referrers for each row execute function touch_updated_at();
create trigger touch_patients before update on patients for each row execute function touch_updated_at();
create trigger touch_referrals before update on referrals for each row execute function touch_updated_at();
create trigger touch_appointments before update on appointments for each row execute function touch_updated_at();
create trigger touch_procedures before update on procedures for each row execute function touch_updated_at();
create trigger touch_letters before update on letters for each row execute function touch_updated_at();
create trigger touch_results before update on results for each row execute function touch_updated_at();
create trigger touch_recalls before update on recalls for each row execute function touch_updated_at();
create trigger touch_invoices before update on invoices for each row execute function touch_updated_at();
create trigger touch_clinical_notes before update on clinical_notes for each row execute function touch_updated_at();
create trigger touch_contacts_log before update on contacts_log for each row execute function touch_updated_at();

insert into policy (key, value, note) values
  ('referral_months_gp', 12, 'A GP referral to a specialist lasts 12 months from the first consultation unless it says otherwise (Services Australia).'),
  ('referral_months_specialist', 3, 'A specialist or consultant physician referral lasts 3 months unless the patient is admitted (Services Australia).'),
  ('letter_days', 7, 'Days after a consultation or operation by which the letter to the referrer should be sent. Your practice standard.'),
  ('result_days', 3, 'Days a result may wait before a doctor has reviewed it. Your practice standard.'),
  ('ifc_days', 14, 'Days before a procedure by which the patient should have signed the written fee estimate. Your practice standard.'),
  ('registration_warn_days', 60, 'Days before registration or indemnity expiry that the attention list starts warning.'),
  ('retention_years_adult', 7, 'Years to keep an adult''s record after the last service. NSW, Victoria and the ACT: 7. New Zealand: 10.'),
  ('retention_age_minor', 25, 'Age until which a record collected before 18 must be kept (NSW, Victoria, ACT). Set to 0 where it does not apply.'),
  ('quiet_referrer_days', 120, 'A referrer who sent patients last year but nothing in this many days counts as gone quiet.');

-- ---------------------------------------------------------------- views

-- Every referral with the date it stops being valid.
create or replace view v_referrals as
select r.id, r.code, p.code as patient_code, p.name as patient, f.code as referrer_code, f.name as referrer, f.kind as referrer_kind,
       pr.code as practitioner_code, pr.name as practitioner, r.issued_on, r.first_seen_on, r.status, r.urgency, r.received_on, r.reason,
       r.indefinite, r.admitted,
       case when r.indefinite then null
            else (coalesce(r.first_seen_on, r.issued_on)
                  + make_interval(months => coalesce(r.valid_months,
                      case when f.kind = 'gp' then (select value from policy where key = 'referral_months_gp')
                           else (select value from policy where key = 'referral_months_specialist') end)))::date
       end as valid_until
from referrals r
join patients p on p.id = r.patient_id
join practitioners pr on pr.id = r.practitioner_id
left join referrers f on f.id = r.referrer_id;

-- Booked or attended consultations and the referral that covers them on the day.
create or replace view v_referral_cover as
select a.id, a.code, a.starts_at::date as on_date, a.status, a.kind, a.item_number, p.code as patient_code, p.name as patient,
       pr.name as practitioner, l.code as location_code,
       vr.code as referral_code, vr.valid_until, vr.indefinite,
       case when vr.code is null then 'no referral'
            when vr.indefinite then 'valid'
            when vr.valid_until < a.starts_at::date then 'expired'
            when vr.valid_until < a.starts_at::date + 30 then 'expiring'
            else 'valid' end as cover
from appointments a
join patients p on p.id = a.patient_id
join practitioners pr on pr.id = a.practitioner_id
join locations l on l.id = a.location_id
left join lateral (
  select v.code, v.valid_until, v.indefinite from v_referrals v
  join referrals r on r.id = v.id
  -- Only a GP, specialist or consultant physician referral counts for a specialist consultation.
  where r.patient_id = a.patient_id and r.practitioner_id = a.practitioner_id and r.status not in ('declined')
    and coalesce(v.referrer_kind, 'gp') in ('gp', 'specialist')
    and coalesce(r.first_seen_on, r.issued_on) <= a.starts_at::date
  order by v.indefinite desc, v.valid_until desc nulls first limit 1
) vr on true
where a.status in ('booked', 'attended') and a.kind <> 'procedure' and l.kind <> 'public_hospital';

-- Locations each practitioner works at without an open provider number.
create or replace view v_provider_gaps as
select distinct pr.code as practitioner_code, pr.name as practitioner, l.code as location_code, l.name as location,
       min(a.starts_at::date) over (partition by pr.id, l.id) as first_booking
from appointments a
join practitioners pr on pr.id = a.practitioner_id
join locations l on l.id = a.location_id
where a.status in ('booked', 'attended') and pr.role in ('specialist', 'anaesthetist', 'allied_health')
  and not exists (select 1 from provider_numbers n where n.practitioner_id = pr.id and n.location_id = l.id
                  and coalesce(n.opened_on, '1900-01-01') <= a.starts_at::date and (n.closed_on is null or n.closed_on >= a.starts_at::date));

create or replace view v_procedures as
select x.id, x.code, p.code as patient_code, p.name as patient, pr.name as surgeon, an.name as anaesthetist, l.name as hospital,
       x.procedure, x.item_numbers, x.planned_on, x.status, x.urgency, x.fee_cents, x.rebate_estimate_cents,
       greatest(x.fee_cents - x.rebate_estimate_cents, 0) as gap_cents, x.ifc_given_on, x.ifc_signed_on, x.hospital_booked_on, x.added_on,
       (x.planned_on - current_date) as days_to_go, (current_date - x.added_on) as days_waiting, p.health_fund
from procedures x
join patients p on p.id = x.patient_id
join practitioners pr on pr.id = x.practitioner_id
left join practitioners an on an.id = x.anaesthetist_id
join locations l on l.id = x.location_id;

create or replace view v_letters_owed as
select t.id, t.code, p.code as patient_code, p.name as patient, pr.name as practitioner, f.name as referrer, f.prefers,
       t.kind, t.due_on, t.dictated_on, (current_date - t.due_on) as days_late
from letters t
join patients p on p.id = t.patient_id
join practitioners pr on pr.id = t.practitioner_id
left join referrers f on f.id = t.referrer_id
where t.sent_on is null;

create or replace view v_results_waiting as
select r.id, p.code as patient_code, p.name as patient, pr.name as practitioner, r.test, r.provider, r.received_on, r.abnormal,
       (current_date - r.received_on) as days_waiting
from results r
join patients p on p.id = r.patient_id
join practitioners pr on pr.id = r.practitioner_id
where r.reviewed_on is null;

create or replace view v_recalls_due as
select c.id, p.code as patient_code, p.name as patient, pr.name as practitioner, c.due_on, c.reason, (c.due_on - current_date) as days_to_due,
       (select min(a.starts_at)::date from appointments a where a.patient_id = c.patient_id and a.practitioner_id = c.practitioner_id
          and a.status = 'booked' and a.starts_at >= now()) as next_booked
from recalls c
join patients p on p.id = c.patient_id
join practitioners pr on pr.id = c.practitioner_id
where c.done_on is null and p.status = 'active';

create or replace view v_debtors as
select i.id, i.code, p.code as patient_code, p.name as patient, i.payer, i.issued_on, i.amount_cents, i.paid_cents,
       (i.amount_cents - i.paid_cents) as owing_cents, (current_date - i.issued_on) as age_days,
       case when current_date - i.issued_on <= 30 then '0-30' when current_date - i.issued_on <= 60 then '31-60'
            when current_date - i.issued_on <= 90 then '61-90' else '90+' end as bucket
from invoices i
join patients p on p.id = i.patient_id
where i.status = 'open' and i.amount_cents > i.paid_cents;

-- How long each record must be kept: years after the last service, and to age 25 for a child's record.
create or replace view v_retention as
select p.id, p.code, p.name, p.status, p.born_on, p.disposal_on, last.last_service_on,
       greatest(
         (last.last_service_on + make_interval(years => (select value from policy where key = 'retention_years_adult')))::date,
         case when (select value from policy where key = 'retention_age_minor') > 0 and p.born_on is not null
                   and first.first_service_on < (p.born_on + interval '18 years')::date
              then (p.born_on + make_interval(years => (select value from policy where key = 'retention_age_minor')))::date end
       ) as keep_until
from patients p
left join lateral (select max(a.starts_at)::date as last_service_on from appointments a where a.patient_id = p.id and a.status = 'attended') last on true
left join lateral (select min(a.starts_at)::date as first_service_on from appointments a where a.patient_id = p.id and a.status = 'attended') first on true;

create or replace view v_registrations as
select pr.code, pr.name, pr.role, pr.registration_number, pr.registration_expires_on, pr.indemnity_expires_on,
       (pr.registration_expires_on - current_date) as registration_days, (pr.indemnity_expires_on - current_date) as indemnity_days
from practitioners pr
where pr.active and pr.role <> 'admin';

-- Referrers by new patients sent: the last 12 months against the 12 before.
create or replace view v_referrer_trend as
select f.code, f.name, f.kind, f.practice,
       count(*) filter (where r.received_on > current_date - 365) as last_12m,
       count(*) filter (where r.received_on <= current_date - 365 and r.received_on > current_date - 730) as prior_12m,
       max(r.received_on) as last_referral_on, (current_date - max(r.received_on)) as days_since
from referrers f
left join referrals r on r.referrer_id = f.id
group by f.id, f.code, f.name, f.kind, f.practice;

-- Everything that needs the front desk or a doctor, worst first.
create or replace view v_attention as
select 1 as severity, 'procedure without consent' as issue, v.patient_code, v.patient, v.surgeon as who, v.planned_on as on_date,
       v.procedure || coalesce(', fee estimate given ' || v.ifc_given_on::text || ' but not signed', ', no fee estimate given') as detail
from v_procedures v
where v.status in ('planned', 'booked') and v.planned_on is not null and v.planned_on <= current_date + 21 and v.ifc_signed_on is null
union all
select 1, 'referral expired', c.patient_code, c.patient, c.practitioner, c.on_date,
       coalesce('referral ' || c.referral_code || ' ended ' || c.valid_until::text, 'no referral on file') || ' (' || c.kind || ')'
from v_referral_cover c
where c.status = 'booked' and c.cover in ('expired', 'no referral') and c.on_date between current_date and current_date + 30
union all
select 1, 'abnormal result waiting', r.patient_code, r.patient, r.practitioner, r.received_on, r.test || ', ' || r.days_waiting || ' days unreviewed'
from v_results_waiting r where r.abnormal
union all
select 1, 'no provider number', null, null, g.practitioner, g.first_booking, 'booked at ' || g.location || ' with no open provider number'
from v_provider_gaps g
union all
select 2, 'letter overdue', l.patient_code, l.patient, l.practitioner, l.due_on, l.kind || ' letter to ' || coalesce(l.referrer, 'referrer') || ', ' || l.days_late || ' days late'
from v_letters_owed l where l.days_late > 0
union all
select 2, 'result waiting', r.patient_code, r.patient, r.practitioner, r.received_on, r.test || ', ' || r.days_waiting || ' days unreviewed'
from v_results_waiting r where not r.abnormal and r.days_waiting > (select value from policy where key = 'result_days')
union all
select 2, 'registration or indemnity', null, null, g.name, least(g.registration_expires_on, g.indemnity_expires_on),
       case when g.registration_days <= (select value from policy where key = 'registration_warn_days') then 'registration ends ' || g.registration_expires_on::text else '' end
       || case when g.registration_days <= (select value from policy where key = 'registration_warn_days')
                and g.indemnity_days <= (select value from policy where key = 'registration_warn_days') then '; ' else '' end
       || case when g.indemnity_days <= (select value from policy where key = 'registration_warn_days') then 'indemnity ends ' || g.indemnity_expires_on::text else '' end
from v_registrations g
where g.registration_days <= (select value from policy where key = 'registration_warn_days')
   or g.indemnity_days <= (select value from policy where key = 'registration_warn_days')
union all
select 2, 'referral expiring', c.patient_code, c.patient, c.practitioner, c.on_date, 'referral ' || c.referral_code || ' ends ' || c.valid_until::text || ', ask the GP for a new one'
from v_referral_cover c
where c.status = 'booked' and c.cover = 'expiring' and c.on_date between current_date and current_date + 30
union all
select 3, 'recall overdue', r.patient_code, r.patient, r.practitioner, r.due_on, r.reason || ', nothing booked'
from v_recalls_due r where r.days_to_due < 0 and r.next_booked is null
union all
select 3, 'account 60+ days', d.patient_code, d.patient, null, d.issued_on, d.code || ' owes $' || to_char(d.owing_cents / 100.0, 'FM999,999,990') || ' (' || replace(d.payer, '_', ' ') || ')'
from v_debtors d where d.age_days > 60
union all
select 3, 'referral not triaged', v.patient_code, v.patient, v.practitioner, v.received_on, coalesce(v.referrer, 'unknown referrer') || ', ' || v.urgency
from v_referrals v where v.status = 'received' and v.received_on < current_date - 2;

-- Lock every table to the service role when this runs on a hosted database.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end
$$;

-- Demo rooms for a two-surgeon orthopaedic practice in Sydney. Synthetic names throughout.
-- Dates are relative to today, so there is always a referral running out, a letter late,
-- a result waiting and a procedure without signed consent.
-- Idempotent: runs once, then does nothing if the demo surgeon already exists.
do $$
declare
  rooms uuid; parra uuid; hosp uuid; dayx uuid; tele uuid;
  chen uuid; menon uuid; laurent uuid; brennan uuid; torres uuid;
  next_sept date := (date_trunc('year', current_date + 92) + interval '9 months' - interval '1 day')::date;
begin
  if exists (select 1 from practitioners where code = 'DR-01') then
    return;
  end if;

  insert into locations (code, name, kind, suburb, state, phone) values
    ('RM', 'Harbour Orthopaedics rooms', 'rooms', 'North Sydney', 'NSW', '02 5550 1100'),
    ('PR', 'Parramatta consulting suite', 'rooms', 'Parramatta', 'NSW', '02 5550 1200'),
    ('HPH', 'Harbourview Private Hospital', 'private_hospital', 'Crows Nest', 'NSW', '02 5550 2000'),
    ('NDS', 'Northside Day Surgery', 'day_surgery', 'Chatswood', 'NSW', '02 5550 3000'),
    ('TEL', 'Telehealth', 'telehealth', null, 'NSW', null);
  select id into rooms from locations where code = 'RM';
  select id into parra from locations where code = 'PR';
  select id into hosp from locations where code = 'HPH';
  select id into dayx from locations where code = 'NDS';
  select id into tele from locations where code = 'TEL';

  insert into practitioners (code, name, role, specialty, registration_number, registration_expires_on, indemnity_expires_on, email) values
    ('DR-01', 'Dr Amelia Chen', 'specialist', 'Orthopaedic surgery, hip and knee', 'MED0001234501', next_sept, current_date + 240, 'amelia.chen@example.invalid'),
    ('DR-02', 'Dr Rajiv Menon', 'specialist', 'Orthopaedic surgery, shoulder and hand', 'MED0001234502', next_sept, current_date + 35, 'rajiv.menon@example.invalid'),
    ('AN-01', 'Dr Sophie Laurent', 'anaesthetist', 'Anaesthesia', 'MED0001234503', next_sept, current_date + 300, 'sophie.laurent@example.invalid'),
    ('RN-01', 'Kate Brennan', 'nurse', 'Practice nurse', 'NMW0001234504', current_date + 40, current_date + 300, 'kate.brennan@example.invalid'),
    ('PM-01', 'Mia Torres', 'admin', 'Practice manager', null, null, null, 'mia.torres@example.invalid');
  select id into chen from practitioners where code = 'DR-01';
  select id into menon from practitioners where code = 'DR-02';
  select id into laurent from practitioners where code = 'AN-01';
  select id into brennan from practitioners where code = 'RN-01';
  select id into torres from practitioners where code = 'PM-01';

  -- Dr Menon started a monthly clinic at Parramatta and nobody opened a provider number for it.
  insert into provider_numbers (practitioner_id, location_id, number, opened_on) values
    (chen, rooms, '2345671A', current_date - 3400), (chen, hosp, '2345672B', current_date - 2900),
    (chen, dayx, '2345673C', current_date - 1500), (chen, tele, '2345674D', current_date - 1500),
    (menon, rooms, '3456781A', current_date - 1800), (menon, hosp, '3456782B', current_date - 1800),
    (laurent, hosp, '4567891A', current_date - 2500), (laurent, dayx, '4567892B', current_date - 1500);

  insert into referrers (code, name, kind, practice, suburb, provider_number, email, phone, prefers) values
    ('GP-01', 'Dr Helen Park', 'gp', 'Lavender Bay Family Practice', 'Lavender Bay', '1122331A', 'reception@lavenderbay.example.invalid', '02 5551 0001', 'secure_message'),
    ('GP-02', 'Dr Marcus Webb', 'gp', 'Cammeray Medical', 'Cammeray', '1122332B', 'admin@cammeray.example.invalid', '02 5551 0002', 'secure_message'),
    ('GP-03', 'Dr Aisha Rahman', 'gp', 'Parramatta Square GPs', 'Parramatta', '1122333C', 'front@psq.example.invalid', '02 5551 0003', 'email'),
    ('GP-04', 'Dr Tom Galloway', 'gp', 'Mosman Junction Doctors', 'Mosman', '1122334D', 'hello@mosmanjd.example.invalid', '02 5551 0004', 'fax'),
    ('GP-05', 'Dr Grace Liu', 'gp', 'Chatswood Health', 'Chatswood', '1122335E', 'clinic@chatswoodhealth.example.invalid', '02 5551 0005', 'secure_message'),
    ('SP-01', 'Dr Nikhil Rao', 'specialist', 'North Shore Rheumatology', 'St Leonards', '1122336F', 'rooms@nsrheum.example.invalid', '02 5551 0006', 'secure_message'),
    ('AH-01', 'Jess Moller', 'allied_health', 'Harbour Physio', 'North Sydney', null, 'jess@harbourphysio.example.invalid', '02 5551 0007', 'email');

  insert into patients (code, name, born_on, phone, email, health_fund, fund_member_ref, medicare_on_file, usual_gp_id, status, disposal_on, notes) values
    ('PT-1001', 'Margaret Ellis', current_date - interval '71 years', '0400 100 001', 'margaret.ellis@example.invalid', 'Bupa', 'BUP-55102', true, (select id from referrers where code = 'GP-01'), 'active', null, 'Right knee osteoarthritis. Lives alone, daughter drives her.'),
    ('PT-1002', 'Daniel Okafor', current_date - interval '44 years', '0400 100 002', 'daniel.okafor@example.invalid', 'Medibank', 'MED-88231', true, (select id from referrers where code = 'GP-02'), 'active', null, 'Rotator cuff tear, left. Electrician.'),
    ('PT-1003', 'Priya Sharma', current_date - interval '58 years', '0400 100 003', 'priya.sharma@example.invalid', 'HCF', 'HCF-30992', true, (select id from referrers where code = 'GP-03'), 'active', null, 'Carpal tunnel, both hands. Prefers Parramatta.'),
    ('PT-1004', 'George Papadopoulos', current_date - interval '66 years', '0400 100 004', 'george.p@example.invalid', 'nib', 'NIB-12004', true, (select id from referrers where code = 'GP-04'), 'active', null, 'Left hip. Total hip replacement planned.'),
    ('PT-1005', 'Lucy Hartmann', current_date - interval '35 years', '0400 100 005', 'lucy.hartmann@example.invalid', null, null, true, (select id from referrers where code = 'GP-05'), 'active', null, 'ACL reconstruction 2025. Uninsured, self-funded.'),
    ('PT-1006', 'Robert Nguyen', current_date - interval '52 years', '0400 100 006', 'robert.nguyen@example.invalid', 'Bupa', 'BUP-77310', true, (select id from referrers where code = 'GP-01'), 'active', null, 'Frozen shoulder, right.'),
    ('PT-1007', 'Ana Silva', current_date - interval '29 years', '0400 100 007', 'ana.silva@example.invalid', 'Medibank', 'MED-40021', true, (select id from referrers where code = 'GP-05'), 'active', null, 'Wrist fracture, malunion.'),
    ('PT-1008', 'William Fraser', current_date - interval '77 years', '0400 100 008', 'w.fraser@example.invalid', 'HCF', 'HCF-11873', true, (select id from referrers where code = 'GP-04'), 'active', null, 'Knee replacement 2024, annual review.'),
    ('PT-1009', 'Chloe Bennett', current_date - interval '23 years', '0400 100 009', 'chloe.bennett@example.invalid', 'nib', 'NIB-67000', true, (select id from referrers where code = 'GP-02'), 'discharged', current_date + 14, 'Seen at 14 for a growth plate injury. Discharged.'),
    ('PT-1010', 'Hamish Cole', current_date - interval '48 years', '0400 100 010', 'hamish.cole@example.invalid', null, null, true, (select id from referrers where code = 'GP-03'), 'active', null, 'Workers compensation claim, shoulder.'),
    ('PT-1011', 'Sarah Kim', current_date - interval '61 years', '0400 100 011', 'sarah.kim@example.invalid', 'Bupa', 'BUP-90112', true, (select id from referrers where code = 'GP-05'), 'active', null, 'Inflammatory arthritis, referred on by rheumatology.'),
    ('PT-1012', 'Tane Walker', current_date - interval '39 years', '0400 100 012', 'tane.walker@example.invalid', 'HCF', 'HCF-20450', true, (select id from referrers where code = 'GP-01'), 'active', null, 'Trigger finger.');

  -- Referrals. Dates are chosen so validity runs out at the right moments.
  insert into referrals (code, patient_id, referrer_id, practitioner_id, issued_on, first_seen_on, valid_months, indefinite, reason, status, urgency, received_on) values
    ('REF-2001', (select id from patients where code = 'PT-1001'), (select id from referrers where code = 'GP-01'), chen, current_date - 400, current_date - 380, null, false, 'Right knee pain, OA on X-ray', 'active', 'routine', current_date - 400),
    ('REF-2002', (select id from patients where code = 'PT-1002'), (select id from referrers where code = 'GP-02'), menon, current_date - 120, current_date - 100, null, false, 'Left shoulder, MRI shows full thickness tear', 'active', 'soon', current_date - 120),
    ('REF-2003', (select id from patients where code = 'PT-1003'), (select id from referrers where code = 'GP-03'), menon, current_date - 70, current_date - 60, null, false, 'Bilateral carpal tunnel, nerve studies attached', 'active', 'routine', current_date - 70),
    ('REF-2004', (select id from patients where code = 'PT-1004'), (select id from referrers where code = 'GP-04'), chen, current_date - 200, current_date - 180, null, false, 'Left hip OA, failed conservative care', 'active', 'routine', current_date - 200),
    ('REF-2005', (select id from patients where code = 'PT-1005'), (select id from referrers where code = 'GP-05'), chen, current_date - 600, current_date - 590, 24, false, 'ACL rupture, right knee', 'active', 'soon', current_date - 600),
    ('REF-2006', (select id from patients where code = 'PT-1006'), (select id from referrers where code = 'GP-01'), menon, current_date - 360, current_date - 352, null, false, 'Right shoulder stiffness 6 months', 'active', 'routine', current_date - 360),
    ('REF-2007', (select id from patients where code = 'PT-1007'), (select id from referrers where code = 'GP-05'), menon, current_date - 45, current_date - 30, null, false, 'Distal radius malunion', 'active', 'soon', current_date - 45),
    ('REF-2008', (select id from patients where code = 'PT-1008'), (select id from referrers where code = 'GP-04'), chen, current_date - 900, current_date - 880, null, true, 'Knee replacement follow-up, ongoing', 'active', 'routine', current_date - 900),
    ('REF-2009', (select id from patients where code = 'PT-1009'), (select id from referrers where code = 'GP-02'), chen, current_date - 3300, current_date - 3290, null, false, 'Distal femur growth plate injury', 'closed', 'urgent', current_date - 3300),
    ('REF-2010', (select id from patients where code = 'PT-1010'), (select id from referrers where code = 'GP-03'), menon, current_date - 20, null, null, false, 'Shoulder injury at work, insurer approved', 'triaged', 'soon', current_date - 20),
    ('REF-2011', (select id from patients where code = 'PT-1011'), (select id from referrers where code = 'SP-01'), chen, current_date - 110, current_date - 100, null, false, 'Knee synovitis, consider arthroscopy', 'active', 'routine', current_date - 110),
    ('REF-2012', (select id from patients where code = 'PT-1012'), (select id from referrers where code = 'GP-01'), menon, current_date - 6, null, null, false, 'Trigger finger, ring finger', 'received', 'routine', current_date - 6),
    ('REF-2013', (select id from patients where code = 'PT-1004'), (select id from referrers where code = 'AH-01'), chen, current_date - 15, null, null, false, 'Physio notes on hip, for information', 'received', 'routine', current_date - 15);

  -- Older referrals so the referrer trend has a past: Dr Galloway used to send four a year.
  insert into referrals (code, patient_id, referrer_id, practitioner_id, issued_on, first_seen_on, reason, status, received_on)
  select 'REF-19' || lpad(g::text, 2, '0'), (select id from patients where code = 'PT-1008'), (select id from referrers where code = case when g <= 4 then 'GP-04' else 'GP-02' end),
         chen, current_date - (400 + g * 40), current_date - (390 + g * 40), 'Earlier referral', 'closed', current_date - (400 + g * 40)
  from generate_series(1, 6) g;

  insert into appointments (code, patient_id, practitioner_id, location_id, referral_id, starts_at, minutes, kind, status, item_number, fee_cents, note) values
    -- Past consultations.
    ('AP-3001', (select id from patients where code = 'PT-1001'), chen, rooms, (select id from referrals where code = 'REF-2001'), (current_date - 380) + time '09:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3002', (select id from patients where code = 'PT-1001'), chen, rooms, (select id from referrals where code = 'REF-2001'), (current_date - 90) + time '09:45', 20, 'review', 'attended', '105', 18000, null),
    ('AP-3003', (select id from patients where code = 'PT-1002'), menon, rooms, (select id from referrals where code = 'REF-2002'), (current_date - 100) + time '10:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3004', (select id from patients where code = 'PT-1002'), menon, rooms, (select id from referrals where code = 'REF-2002'), (current_date - 12) + time '10:30', 20, 'pre_op', 'attended', '105', 18000, null),
    ('AP-3005', (select id from patients where code = 'PT-1003'), menon, parra, (select id from referrals where code = 'REF-2003'), (current_date - 60) + time '14:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3006', (select id from patients where code = 'PT-1004'), chen, rooms, (select id from referrals where code = 'REF-2004'), (current_date - 180) + time '11:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3007', (select id from patients where code = 'PT-1004'), chen, rooms, (select id from referrals where code = 'REF-2004'), (current_date - 9) + time '11:30', 20, 'pre_op', 'attended', '105', 18000, null),
    ('AP-3008', (select id from patients where code = 'PT-1005'), chen, rooms, (select id from referrals where code = 'REF-2005'), (current_date - 590) + time '15:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3009', (select id from patients where code = 'PT-1005'), chen, tele, (select id from referrals where code = 'REF-2005'), (current_date - 40) + time '16:00', 15, 'telehealth', 'attended', '105', 15000, null),
    ('AP-3010', (select id from patients where code = 'PT-1006'), menon, rooms, (select id from referrals where code = 'REF-2006'), (current_date - 352) + time '09:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3011', (select id from patients where code = 'PT-1006'), menon, rooms, (select id from referrals where code = 'REF-2006'), (current_date - 150) + time '09:20', 20, 'review', 'attended', '105', 18000, null),
    ('AP-3012', (select id from patients where code = 'PT-1007'), menon, rooms, (select id from referrals where code = 'REF-2007'), (current_date - 30) + time '13:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3013', (select id from patients where code = 'PT-1008'), chen, rooms, (select id from referrals where code = 'REF-2008'), (current_date - 370) + time '10:00', 20, 'review', 'attended', '105', 18000, null),
    ('AP-3014', (select id from patients where code = 'PT-1009'), chen, rooms, (select id from referrals where code = 'REF-2009'), (current_date - 3290) + time '08:30', 45, 'initial', 'attended', '104', 30000, 'Seen with mother.'),
    ('AP-3015', (select id from patients where code = 'PT-1009'), chen, rooms, (select id from referrals where code = 'REF-2009'), (current_date - 3000) + time '08:30', 20, 'review', 'attended', '105', 16000, 'Discharged.'),
    ('AP-3016', (select id from patients where code = 'PT-1011'), chen, rooms, (select id from referrals where code = 'REF-2011'), (current_date - 100) + time '12:00', 45, 'initial', 'attended', '104', 35000, null),
    ('AP-3017', (select id from patients where code = 'PT-1006'), menon, rooms, (select id from referrals where code = 'REF-2006'), (current_date - 21) + time '09:40', 20, 'review', 'did_not_attend', null, null, 'No show, no call.'),
    ('AP-3018', (select id from patients where code = 'PT-1003'), menon, parra, (select id from referrals where code = 'REF-2003'), (current_date - 25) + time '14:30', 20, 'review', 'did_not_attend', null, null, 'Rang after, car broke down.'),
    ('AP-3019', (select id from patients where code = 'PT-1001'), chen, rooms, (select id from referrals where code = 'REF-2001'), (current_date - 3) + time '09:00', 20, 'review', 'attended', '105', 18000, 'Decided on knee replacement.'),
    -- Coming up.
    ('AP-3101', (select id from patients where code = 'PT-1006'), menon, rooms, (select id from referrals where code = 'REF-2006'), (current_date + 8) + time '09:20', 20, 'review', 'booked', null, null, 'Rebooked after the missed visit.'),
    ('AP-3102', (select id from patients where code = 'PT-1003'), menon, parra, (select id from referrals where code = 'REF-2003'), (current_date + 12) + time '14:00', 20, 'review', 'booked', null, null, null),
    ('AP-3103', (select id from patients where code = 'PT-1011'), chen, rooms, (select id from referrals where code = 'REF-2011'), (current_date + 5) + time '12:00', 20, 'review', 'booked', null, null, 'Specialist referral, 3 months only.'),
    ('AP-3104', (select id from patients where code = 'PT-1010'), menon, rooms, (select id from referrals where code = 'REF-2010'), (current_date + 3) + time '10:00', 45, 'initial', 'booked', null, null, 'Workers comp. Bring the claim number.'),
    ('AP-3105', (select id from patients where code = 'PT-1007'), menon, rooms, (select id from referrals where code = 'REF-2007'), (current_date + 15) + time '13:30', 20, 'pre_op', 'booked', null, null, null),
    ('AP-3106', (select id from patients where code = 'PT-1005'), chen, rooms, (select id from referrals where code = 'REF-2005'), (current_date + 26) + time '15:00', 20, 'review', 'booked', null, null, '12 month ACL review.'),
    ('AP-3107', (select id from patients where code = 'PT-1002'), menon, rooms, (select id from referrals where code = 'REF-2002'), (current_date + 30) + time '10:30', 20, 'post_op', 'booked', null, null, null),
    ('AP-3108', (select id from patients where code = 'PT-1001'), chen, rooms, null, (current_date + 1) + time '09:00', 20, 'pre_op', 'booked', null, null, null),
    ('AP-3109', (select id from patients where code = 'PT-1004'), chen, hosp, (select id from referrals where code = 'REF-2004'), (current_date + 10) + time '07:30', 120, 'procedure', 'booked', null, null, 'Left total hip replacement.'),
    ('AP-3110', (select id from patients where code = 'PT-1008'), chen, rooms, (select id from referrals where code = 'REF-2008'), (current_date + 20) + time '10:00', 20, 'review', 'booked', null, null, 'Annual knee review.');

  -- REF-2006 started 352 days ago: Robert Nguyen's 12 months run out before his next visit.
  -- REF-2011 is a specialist referral seen 100 days ago: its 3 months are already over.
  -- AP-3108 has no referral linked, but REF-2001 still covers it: the view finds the right one.

  insert into procedures (code, patient_id, practitioner_id, anaesthetist_id, location_id, procedure, planned_on, status, urgency, fee_cents, rebate_estimate_cents,
                          ifc_given_on, ifc_signed_on, hospital_booked_on, added_on, note) values
    ('PX-4001', (select id from patients where code = 'PT-1004'), chen, laurent, hosp, 'Left total hip replacement', current_date + 10, 'booked', 'routine', 620000, 248000,
      null, null, current_date - 8, current_date - 30, 'Fee estimate not yet sent. Fund is nib.'),
    ('PX-4002', (select id from patients where code = 'PT-1002'), menon, laurent, hosp, 'Arthroscopic rotator cuff repair, left', current_date + 14, 'booked', 'soon', 410000, 165000,
      current_date - 10, null, current_date - 10, current_date - 12, 'Estimate emailed, signed copy not back.'),
    ('PX-4003', (select id from patients where code = 'PT-1001'), chen, laurent, hosp, 'Right total knee replacement', current_date + 40, 'booked', 'routine', 650000, 260000,
      current_date - 2, current_date - 1, current_date - 2, current_date - 3, null),
    ('PX-4004', (select id from patients where code = 'PT-1007'), menon, laurent, dayx, 'Corrective osteotomy, right distal radius', current_date + 22, 'planned', 'soon', 380000, 150000,
      null, null, null, current_date - 30, null),
    ('PX-4005', (select id from patients where code = 'PT-1003'), menon, null, dayx, 'Carpal tunnel release, right', null, 'waitlist', 'routine', 160000, 70000,
      null, null, null, current_date - 58, 'Wants both hands done, right first.'),
    ('PX-4006', (select id from patients where code = 'PT-1005'), chen, laurent, hosp, 'ACL reconstruction, right knee', current_date - 520, 'done', 'soon', 520000, 0,
      current_date - 560, current_date - 555, current_date - 560, current_date - 580, 'Self-funded. Paid in full before surgery.'),
    ('PX-4007', (select id from patients where code = 'PT-1011'), chen, null, dayx, 'Knee arthroscopy and synovectomy', null, 'waitlist', 'routine', 280000, 110000,
      null, null, null, current_date - 95, 'Waiting on rheumatology to settle the flare.');

  insert into letters (code, patient_id, practitioner_id, referrer_id, appointment_id, procedure_id, kind, due_on, dictated_on, sent_on, summary) values
    ('LT-5001', (select id from patients where code = 'PT-1001'), chen, (select id from referrers where code = 'GP-01'), (select id from appointments where code = 'AP-3001'), null, 'consult', current_date - 373, current_date - 379, current_date - 376, 'Right knee OA, conservative care first.'),
    ('LT-5002', (select id from patients where code = 'PT-1002'), menon, (select id from referrers where code = 'GP-02'), (select id from appointments where code = 'AP-3003'), null, 'consult', current_date - 93, current_date - 99, current_date - 95, 'Full thickness tear, repair advised.'),
    ('LT-5003', (select id from patients where code = 'PT-1003'), menon, (select id from referrers where code = 'GP-03'), (select id from appointments where code = 'AP-3005'), null, 'consult', current_date - 53, current_date - 50, null, 'Bilateral carpal tunnel, release advised. Waitlisted right first.'),
    ('LT-5004', (select id from patients where code = 'PT-1004'), chen, (select id from referrers where code = 'GP-04'), (select id from appointments where code = 'AP-3007'), null, 'progress', current_date - 2, null, null, 'Pre-op review, fit for surgery.'),
    ('LT-5005', (select id from patients where code = 'PT-1007'), menon, (select id from referrers where code = 'GP-05'), (select id from appointments where code = 'AP-3012'), null, 'consult', current_date - 23, current_date - 28, current_date - 27, 'Malunion, osteotomy planned.'),
    ('LT-5006', (select id from patients where code = 'PT-1011'), chen, (select id from referrers where code = 'SP-01'), (select id from appointments where code = 'AP-3016'), null, 'consult', current_date - 93, current_date - 99, current_date - 98, 'Synovitis, copy to GP.'),
    ('LT-5007', (select id from patients where code = 'PT-1001'), chen, (select id from referrers where code = 'GP-01'), (select id from appointments where code = 'AP-3019'), null, 'progress', current_date + 4, null, null, 'Proceeding to knee replacement.'),
    ('LT-5008', (select id from patients where code = 'PT-1005'), chen, (select id from referrers where code = 'GP-05'), null, (select id from procedures where code = 'PX-4006'), 'operation', current_date - 513, current_date - 519, current_date - 518, 'ACL reconstruction, uneventful.');

  insert into results (patient_id, practitioner_id, test, provider, received_on, abnormal, reviewed_on, action) values
    ((select id from patients where code = 'PT-1004'), chen, 'Pre-op bloods: FBC, UEC', 'Harbour Pathology', current_date - 2, true, null, null),
    ((select id from patients where code = 'PT-1002'), menon, 'ECG', 'Harbourview Cardiology', current_date - 6, false, null, null),
    ((select id from patients where code = 'PT-1007'), menon, 'CT right wrist', 'North Shore Imaging', current_date - 20, false, current_date - 19, 'Plan osteotomy'),
    ((select id from patients where code = 'PT-1001'), chen, 'X-ray right knee, standing', 'North Shore Imaging', current_date - 4, false, current_date - 3, 'Reviewed in clinic');

  insert into recalls (patient_id, practitioner_id, due_on, reason, done_on) values
    ((select id from patients where code = 'PT-1005'), chen, current_date + 20, '12 month ACL review', null),
    ((select id from patients where code = 'PT-1012'), menon, current_date - 10, 'Check trigger finger after injection', null),
    ((select id from patients where code = 'PT-1006'), menon, current_date - 30, 'Six month shoulder review', null),
    ((select id from patients where code = 'PT-1008'), chen, current_date - 5, 'Annual knee replacement review', null);

  insert into invoices (code, patient_id, appointment_id, procedure_id, payer, issued_on, amount_cents, paid_cents, status, note) values
    ('INV-6001', (select id from patients where code = 'PT-1003'), (select id from appointments where code = 'AP-3005'), null, 'patient', current_date - 60, 14600, 0, 'open', 'Gap after Medicare rebate.'),
    ('INV-6002', (select id from patients where code = 'PT-1010'), null, null, 'workers_comp', current_date - 75, 42000, 0, 'open', 'Records request and report, insurer slow.'),
    ('INV-6003', (select id from patients where code = 'PT-1007'), (select id from appointments where code = 'AP-3012'), null, 'patient', current_date - 30, 14600, 5000, 'open', null),
    ('INV-6004', (select id from patients where code = 'PT-1001'), (select id from appointments where code = 'AP-3019'), null, 'patient', current_date - 3, 6900, 0, 'open', null),
    ('INV-6005', (select id from patients where code = 'PT-1005'), null, (select id from procedures where code = 'PX-4006'), 'patient', current_date - 560, 520000, 520000, 'paid', 'Prepaid.'),
    ('INV-6006', (select id from patients where code = 'PT-1002'), (select id from appointments where code = 'AP-3003'), null, 'patient', current_date - 100, 14600, 14600, 'paid', null);

  insert into clinical_notes (patient_id, practitioner_id, appointment_id, written_on, note) values
    ((select id from patients where code = 'PT-1001'), chen, (select id from appointments where code = 'AP-3019'), current_date - 3, 'Pain at night, walking 200 m. Knee replacement discussed: risks, recovery, fee estimate to follow.'),
    ((select id from patients where code = 'PT-1004'), chen, (select id from appointments where code = 'AP-3007'), current_date - 9, 'Fit for surgery. Bloods ordered. Stop anti-inflammatories a week before.');

  insert into contacts_log (patient_id, referrer_id, happened_on, kind, summary, by_name) values
    ((select id from patients where code = 'PT-1003'), null, current_date - 25, 'call', 'Rang to rebook after missing review. Booked for Parramatta.', 'Mia Torres'),
    (null, (select id from referrers where code = 'GP-04'), current_date - 210, 'visit', 'Dropped in to Mosman Junction with new rooms brochure.', 'Mia Torres');
end
$$;

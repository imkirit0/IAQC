-- Restores the four checklist sections dropped when the G-TEC Operations/Academics criteria were introduced.
-- Adds a section only if no section of that name exists (so a later deactivation by IAQA is respected), and bumps
-- the checklist version once when anything was added. Submitted reports keep their own snapshot.
do $$
declare
  w jsonb := coalesce((select value from public.settings where key = 'priority_weights'), '{"Critical":10,"High":6,"Medium":3,"Low":1}');
  sec record; sid bigint; added boolean := false; base int := coalesce((select max(sort) from public.sections), 0);
begin
  for sec in select * from (values
    (1, 'Financial Transparency', '[
      ["Student fees correspond with the approved fee structure.", "High", false, true],
      ["No unauthorised additional charges are collected.", "Critical", true, true],
      ["Collection records match available student fee records.", "Critical", true, true],
      ["Pending instalments and outstanding balances are properly documented.", "Medium", false, false],
      ["Financial discrepancies are reported and explained.", "Critical", true, false],
      ["Applicable royalty and other payments are properly documented.", "High", false, false]]'::jsonb),
    (2, 'Marketing and Admissions', '[
      ["Marketing materials follow approved brand guidelines.", "Medium", false, false],
      ["Only authorised logos, advertisements, and promotional claims are used.", "High", false, false],
      ["Course details and certifications are accurately represented.", "High", false, false],
      ["Admissions are recorded in the official system.", "High", false, true],
      ["Student fee commitments are clearly communicated.", "Medium", false, false],
      ["Unauthorised discounts and promotional offers are not provided.", "High", false, false]]'::jsonb),
    (3, 'Brand and Policy Compliance', '[
      ["Centre follows the franchise agreement and applicable organisational policies.", "High", false, true],
      ["Centre premises and signage meet approved brand standards.", "Medium", false, false],
      ["Official identity and branding are used correctly.", "Medium", false, false],
      ["No unauthorised courses or services are promoted.", "High", false, false],
      ["Centre follows approved communication and reporting procedures.", "Low", false, false]]'::jsonb),
    (4, 'Student Satisfaction and Service Quality', '[
      ["Student feedback is collected where appropriate.", "Low", false, false],
      ["Student complaints are recorded and addressed.", "Medium", false, false],
      ["Students receive accurate course and fee information.", "Medium", false, false],
      ["Students report that classes are conducted as promised.", "Medium", false, false],
      ["Student concerns about fees, academics, or services are documented.", "Low", false, false]]'::jsonb)
  ) as t(n, name, crits)
  loop
    continue when exists (select 1 from public.sections where lower(name) = lower(sec.name));
    insert into public.sections (name, sort) values (sec.name, base + sec.n) returning id into sid;
    insert into public.criteria (section_id, text, priority, weight, critical, mandatory, sort)
      select sid, c->>0, c->>1, (w->>(c->>1))::double precision, (c->>2)::boolean, (c->>3)::boolean, i
      from jsonb_array_elements(sec.crits) with ordinality as x(c, i);
    added := true;
  end loop;
  if added then
    insert into public.settings (key, value) values ('checklist_version', '2')
    on conflict (key) do update set value = to_jsonb(coalesce((public.settings.value)::text::int, 1) + 1);
  end if;
end $$;

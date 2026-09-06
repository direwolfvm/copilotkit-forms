-- Seed the HelpPermitMe portal's own process catalog.
--
-- Why this exists
-- ---------------
-- The portal shares Supabase project `yiggjfcwpagbupsmueax` with permitflow, reviewworks,
-- helppermitme2 and permitfast2. Verified 2026-09-06, tenant helppermitme
-- (9237f453-de19-4511-81b8-71a3fd7c3b32) owned ZERO process_model and ZERO decision_element rows.
--
-- The application had been resolving its catalog by hardcoded numeric id, and those ids are
-- assigned by a sequence shared across every tenant:
--
--   process_model    id 1 -> "Complex Environmental Review"  (reviewworks)
--   process_model    id 2 -> "Basic Permit"                  (permitflow)
--   decision_element id 8/9/10 -> "User id" / "Project Information" / "SF-299 Application" (permitflow)
--
-- Consequences that this migration fixes:
--   * loadProcessInformation() rendered another tenant's process model in our UI.
--   * 133 of 136 process_decision_payload rows had process_decision_element = NULL, because the
--     decision-element lookup IS tenant-scoped and matched nothing.
--   * 3 payload rows (499, 500, 521) pointed at permitflow's decision elements 8 and 9.
--
-- The application code now resolves by title and process_model_internal_reference_id within the
-- tenant filter, so ids assigned here can be anything the sequence hands out.
--
-- Idempotent: re-running is a no-op.

begin;

\set tenant '9237f453-de19-4511-81b8-71a3fd7c3b32'

-- ---------------------------------------------------------------------------
-- 1. Pre-screening process model
-- ---------------------------------------------------------------------------
insert into public.process_model
  (tenant_id, title, description, screening_description, agency,
   data_source_system, record_owner_agency, data_record_version, last_updated, retrieved_timestamp)
select
  :'tenant'::uuid,
  'Project Pre-screening',
  'Pre-application triage that captures core project data, runs NEPA Assist and IPaC screenings, and organizes permitting and CE logic.',
  'Collect inputs for a pre-screening process that initiates a project and starts related permitting and environmental review processes',
  'CEQ Permitting Innovation Center',
  'project-portal', 'CEQ', 1, now(), now()
where not exists (
  select 1 from public.process_model
  where tenant_id = :'tenant'::uuid and title = 'Project Pre-screening'
);

-- ---------------------------------------------------------------------------
-- 2. Pre-screening decision elements, keyed by process_model_internal_reference_id
-- ---------------------------------------------------------------------------
with model as (
  select id from public.process_model
  where tenant_id = :'tenant'::uuid and title = 'Project Pre-screening'
),
seed (reference_id, title, description, form_text, category, spatial) as (values
  ('prescreening-project-details',
   'Complete project information',
   'Capture the full project entity as a JSON object to support downstream checks.',
   'Provide complete project details', 'input', false),
  ('prescreening-nepa-assist',
   'Geospatial screening results - NEPA Assist',
   'Store raw and summarized NEPA Assist results for the project footprint.',
   'Confirm or upload NEPA Assist results if auto fetch fails', 'screening', true),
  ('prescreening-ipac',
   'Geospatial screening results - IPAC',
   'Store raw and summarized IPaC results for listed species and critical habitat proximity.',
   'Confirm or upload IPaC results if auto fetch fails', 'screening', true),
  ('prescreening-permitting-checklist',
   'Permitting checklist',
   'Track candidate permits and approvals as a structured checklist with optional narrative.',
   'Provide permit applicability notes', 'checklist', false),
  ('prescreening-categorical-exclusion',
   'Categorical exclusion',
   'Record categorical exclusion references and the rationale for applying them.',
   'Enter CE references and rationale', 'ce', false),
  ('prescreening-conditions',
   'Conditions',
   'Record applicable conditions, mitigation and follow-up notes.',
   'List applicable conditions and notes', 'conditions', false),
  ('prescreening-resource-analysis',
   'Resource area analysis',
   'Capture resource-by-resource analysis notes for the screened project.',
   'Provide resource-by-resource notes', 'analysis', false)
)
insert into public.decision_element
  (tenant_id, process_model, title, description, measure, threshold, spatial,
   form_text, evaluation_method, category, process_model_internal_reference_id,
   data_source_system, record_owner_agency, data_record_version, last_updated, retrieved_timestamp)
select
  :'tenant'::uuid, model.id, seed.title, seed.description, 'complete', 1, seed.spatial,
  seed.form_text, 'complete information', seed.category, seed.reference_id,
  'project-portal', 'CEQ', 1, now(), now()
from seed cross join model
where not exists (
  select 1 from public.decision_element existing
  where existing.tenant_id = :'tenant'::uuid
    and existing.process_model_internal_reference_id = seed.reference_id
);

-- ---------------------------------------------------------------------------
-- 3. IPaC ESA consultation shadow workflow
-- ---------------------------------------------------------------------------
insert into public.process_model
  (tenant_id, title, description, notes, screening_description, agency,
   legal_structure_text, data_source_system, record_owner_agency,
   data_record_version, last_updated, retrieved_timestamp)
select
  :'tenant'::uuid,
  'IPaC ESA Consultation Shadow Workflow',
  'Tracks an endangered species consultation carried out in IPaC after the project footprint is submitted from HelpPermitMe. Defined locally because IPaC does not publish decision elements or form metadata for in-app execution.',
  'Users still authenticate with login.gov and complete the authoritative consultation in IPaC. HelpPermitMe tracks the milestone state needed for permit management.',
  'Submit project geospatial data to IPaC, create the project externally, then mark the consultation complete once the external review is finished.',
  'DOI / U.S. Fish and Wildlife Service (IPaC)',
  'Endangered Species Act Section 7 consultation via IPaC manual integration',
  'project-portal', 'HelpPermitMe', 1, now(), now()
where not exists (
  select 1 from public.process_model
  where tenant_id = :'tenant'::uuid and title = 'IPaC ESA Consultation Shadow Workflow'
);

with model as (
  select id from public.process_model
  where tenant_id = :'tenant'::uuid and title = 'IPaC ESA Consultation Shadow Workflow'
),
seed (reference_id, title, description, measure, form_text, evaluation_method, category, spatial) as (values
  ('ipac-shadow-geospatial-data', 'Geospatial data',
   'The project footprint is submitted from HelpPermitMe to IPaC.',
   'Project footprint submitted', 'Use the saved project line or polygon footprint.',
   'Application event', 'System', true),
  ('ipac-shadow-project-created', 'Project Created',
   'The user creates the IPaC project after authenticating through login.gov.',
   'IPaC project initialized', 'Mark complete after the project has been created in IPaC.',
   'User attestation', 'Manual', false),
  ('ipac-shadow-consultation-complete', 'Consultation Complete',
   'The user finishes the endangered species consultation workflow in IPaC.',
   'External consultation completed', 'Mark complete when the IPaC consultation is finished.',
   'User attestation', 'Manual', false)
)
insert into public.decision_element
  (tenant_id, process_model, title, description, measure, spatial, form_text,
   evaluation_method, category, process_model_internal_reference_id,
   data_source_system, data_source_agency, record_owner_agency,
   data_record_version, last_updated, retrieved_timestamp)
select
  :'tenant'::uuid, model.id, seed.title, seed.description, seed.measure, seed.spatial,
  seed.form_text, seed.evaluation_method, seed.category, seed.reference_id,
  'project-portal', 'HelpPermitMe', 'HelpPermitMe', 1, now(), now()
from seed cross join model
where not exists (
  select 1 from public.decision_element existing
  where existing.tenant_id = :'tenant'::uuid
    and existing.process_model_internal_reference_id = seed.reference_id
);

-- ---------------------------------------------------------------------------
-- 4. Repoint the three payload rows that reference permitflow decision elements
--    499 -> geospatial data, 500 -> project created, 521 -> geospatial data
-- ---------------------------------------------------------------------------
update public.process_decision_payload p
set process_decision_element = e.id,
    last_updated = now()
from public.decision_element e
where p.tenant_id = :'tenant'::uuid
  and e.tenant_id = :'tenant'::uuid
  and e.process_model_internal_reference_id = case p.process_decision_element
        when 8 then 'ipac-shadow-geospatial-data'
        when 9 then 'ipac-shadow-project-created'
        when 10 then 'ipac-shadow-consultation-complete'
      end
  and p.process_decision_element in (8, 9, 10);

-- ---------------------------------------------------------------------------
-- 5. Repoint process_instance rows away from other tenants' process models
-- ---------------------------------------------------------------------------
update public.process_instance pi
set process_model = pm.id, last_updated = now()
from public.process_model pm
where pi.tenant_id = :'tenant'::uuid
  and pm.tenant_id = :'tenant'::uuid
  and pm.title = 'Project Pre-screening'
  and pi.process_model = 1;

update public.process_instance pi
set process_model = pm.id, last_updated = now()
from public.process_model pm
where pi.tenant_id = :'tenant'::uuid
  and pm.tenant_id = :'tenant'::uuid
  and pm.title = 'IPaC ESA Consultation Shadow Workflow'
  and pi.process_model = 2;

-- ---------------------------------------------------------------------------
-- 6. Backfill pre-screening payloads that were written while no catalog existed.
--    evaluation_data->>'title' carries the decision element's form_text, which is the only
--    surviving link between a payload row and the element it belongs to.
-- ---------------------------------------------------------------------------
update public.process_decision_payload p
set process_decision_element = e.id,
    last_updated = now()
from public.decision_element e
where p.tenant_id = :'tenant'::uuid
  and e.tenant_id = :'tenant'::uuid
  and p.process_decision_element is null
  and e.form_text = p.evaluation_data->>'title';

commit;

-- Verification
--   select id, title from public.process_model where tenant_id = '9237f453-...';        -- expect 2
--   select count(*) from public.decision_element where tenant_id = '9237f453-...';      -- expect 10
--   select count(*) from public.process_instance
--     where tenant_id = '9237f453-...' and process_model in (1, 2);                     -- expect 0
--   select count(*) from public.process_decision_payload
--     where tenant_id = '9237f453-...' and process_decision_element is null;            -- expect 7
--
-- Applied 2026-09-06 against yiggjfcwpagbupsmueax via PostgREST as the anon role.
-- Result: process_model 21 (Project Pre-screening) and 22 (IPaC ESA Consultation Shadow
-- Workflow); decision_element 37-43 (pre-screening) and 44-46 (IPaC shadow); 25 process_instance
-- rows repointed off models 1 and 2; 129 payload rows linked (126 backfilled by title, 3 moved
-- off permitflow elements 8/9). 7 payload rows carry no title in evaluation_data and remain null.

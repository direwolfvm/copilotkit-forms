# Database setup

HelpPermitMe uses a PIC/CEQ-style Supabase schema for projects, process models and instances,
decision elements and payloads, case events, GIS data, documents, and related reference entities.

## Recommended setup for a fresh database

Use the ordered scripts in [`../resources/`](../resources/):

1. Apply `01_supabase_schema.sql` once to a fresh Supabase Postgres database.
2. Apply `02_seed_pic_core_rows.sql` to seed the Project Pre-screening process model, its legal
   structure, and decision elements. This seed is safe to rerun.
3. Apply `03_add_tenant_support.sql` to create the tenant registry, seed the default
   `helppermitme` tenant, add and backfill `tenant_id`, and create foreign keys and indexes. This
   migration is designed to be idempotent.
4. Create a Supabase Storage bucket named `permit-documents`.
5. Configure Row Level Security, authentication, and Storage policies for the intended users and
   tenant boundaries.
6. Copy the selected tenant UUID into `SUPABASE_TENANT_ID` (or an accepted alias) in the
   application environment.

Run the scripts in order in the Supabase SQL editor or through your normal migration tooling. The
first schema script is intended for a fresh database and may contain statements that are not safe
to rerun against an existing environment.

To find the seeded tenant ID:

```sql
select id, slug, name, is_default
from public.tenant
where slug = 'helppermitme';
```

The tenant migration intentionally does not create RLS policies. Do not expose a database to
untrusted users until policies have been designed, applied, and tested. Use only an anon/public key
in the application; never configure a service-role key.

## Storage

The canonical portal uses `permit-documents` for:

- generated PDF project reports; and
- supporting PDF, DOCX, JPG/JPEG, and PNG files.

PermitFast may use a bucket with the same name in its own Supabase project for SF-299 file fields.
These are separate storage domains when the integrations point at different Supabase projects.

Use the least-permissive Storage policies that support the required authenticated or tenant-scoped
workflow. Public read/write access is not recommended.

## Existing databases

Back up the database and inspect the current schema before applying any migration. In particular:

- `01_supabase_schema.sql` is a bootstrap script, not an idempotent upgrade;
- `02_seed_pic_core_rows.sql` upserts fixed seed IDs and advances identity sequences; and
- `03_add_tenant_support.sql` backfills every current row to the seeded `helppermitme` tenant before
  making `tenant_id` non-null.

If the database already contains multiple tenants or conflicting fixed IDs, adapt and review the
scripts rather than applying them unchanged.

## Upstream and legacy material

This directory retains:

- `prod.sql` and `schema-v1.0.0-to-1.2.0.sql`, derived from the
  [GSA-TTS/pic-standards](https://github.com/GSA-TTS/pic-standards/tree/main/src/database) v1.2.0
  database material;
- CSV exports of legal structures, process models, and decision elements;
- schema crosswalk and example payload files; and
- [`API_INTEGRATION.md`](API_INTEGRATION.md), which documents the historical three-element Basic
  Permit API flow.

That legacy API flow has been superseded for Right of Way Authorization by the tenant-aware,
phased SF-299 integration described in
[`../PERMITFAST_HANDOFF.md`](../PERMITFAST_HANDOFF.md). Use the ordered scripts in `resources/` for
the current HelpPermitMe portal unless you specifically need to reproduce the upstream v1.2.0
database.

# Database Setup

This folder contains the SQL migrations and data exports needed to recreate the Permit Intelligence Center database schema.

## Prerequisites

- A [Supabase](https://supabase.com) project (or compatible Postgres instance).
- Access to the SQL files in this directory (`prod.sql` and `schema-v1.0.0-to-1.2.0.sql`).
- Access to the CSV exports (`decision_element full export.csv`, `legal_structure full export.csv`, and `process_model full export.csv`).

## Setup Instructions

1. Apply `prod.sql` to create the initial schema and seed data.
2. Apply `schema-v1.0.0-to-1.2.0.sql` to bring the schema up to the v1.2.0 state.
3. Import each of the CSV export files into the corresponding tables.
4. Create a Supabase storage bucket named `permit-documents` and configure its access policy to allow public read/write access, or adjust policies to match your security requirements.
5. Implement Row Level Security (RLS) and authentication as needed. By default RLS is disabled, so treat your anon/public key carefully until additional protections are in place.

## Source of SQL Files

The SQL files in this folder are derived from the [GSA-TTS/pic-standards](https://github.com/GSA-TTS/pic-standards/tree/main/src/database) repository, tag [v1.2.0](https://github.com/GSA-TTS/pic-standards/releases/tag/v1.2.0).

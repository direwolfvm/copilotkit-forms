# External System API Integration Guide

This document describes how an external system can create permit applications through the Supabase API, matching the workflow implemented in the PermitFlow web application.

## Overview

To create a permit application programmatically, you need to:

1. Authenticate with Supabase to get a user ID and access token
2. Create a `project` record
3. Create a `process_instance` record linked to the project
4. Create 3 `process_decision_payload` records (one per decision element)
5. Create `case_event` records to log the workflow milestones

## Prerequisites

- **Supabase URL**: Your project URL (e.g., `https://your-project.supabase.co`)
- **Supabase Anon Key**: The publishable anon key for API access
- **User Credentials**: Email and password for the applicant account

## API Base URL

All REST API endpoints follow this pattern:
```
{SUPABASE_URL}/rest/v1/{table_name}
```

## Authentication Headers

All API requests require these headers:
```http
apikey: {SUPABASE_ANON_KEY}
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
Prefer: return=representation
```

---

## Step 1: Authenticate with Supabase

Sign in to get the user ID and access token.

### Request

```bash
curl -X POST "{SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'
```

### Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "abc123...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "authenticated",
    ...
  }
}
```

**Important**: Save the `access_token` and `user.id` for subsequent requests.

---

## Step 2: Create Project

Create the project record with permit application data.

### Request

```bash
curl -X POST "{SUPABASE_URL}/rest/v1/project" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "title": "Highway 101 Utility Installation",
    "description": "Installation of underground fiber optic cable along Highway 101",
    "sector": "infrastructure",
    "lead_agency": "Department of Transportation",
    "type": "utility_installation",
    "location_lat": 37.7749,
    "location_lon": -122.4194,
    "location_text": "Highway 101, San Francisco, CA",
    "current_status": "draft",
    "user_id": "{USER_ID}"
  }'
```

### Project Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | text | Yes | Descriptive name of the project |
| `description` | text | No | Summary of the project's goals and scope |
| `sector` | text | No | High-level category (energy, transportation, etc.) |
| `lead_agency` | text | No | Federal agency supervising the project |
| `type` | text | No | Classification sub-type (pipeline, highway, etc.) |
| `location_lat` | float | No | Latitude of project center |
| `location_lon` | float | No | Longitude of project center |
| `location_text` | text | No | Text description of location |
| `current_status` | text | Yes | Must be `"draft"` for new applications |
| `user_id` | text | Yes | The authenticated user's ID |
| `start_date` | date | No | Environmental review initiation date |
| `funding` | text | No | Funding source reference |
| `sponsor` | text | No | Name of responsible entity |

### Response

```json
{
  "id": 123,
  "created_at": "2026-01-15T10:30:00.000Z",
  "title": "Highway 101 Utility Installation",
  "current_status": "draft",
  ...
}
```

**Save the `id` as `PROJECT_ID` for the next steps.**

---

## Step 3: Create Process Instance

Create the permit process instance linked to the project.

### Request

```bash
curl -X POST "{SUPABASE_URL}/rest/v1/process_instance" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "parent_project_id": {PROJECT_ID},
    "process_model": 1,
    "status": "draft",
    "start_date": "2026-01-15"
  }'
```

### Process Instance Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parent_project_id` | bigint | Yes | Reference to the project ID |
| `process_model` | bigint | Yes | Process model ID (use `1` for "Basic Permit") |
| `status` | text | Yes | Must be `"draft"` for new applications |
| `start_date` | date | No | Application start date (defaults to today) |
| `description` | text | No | Optional process description |
| `lead_agency` | text | No | Lead agency for this process |

### Response

```json
{
  "id": 456,
  "created_at": "2026-01-15T10:31:00.000Z",
  "parent_project_id": 123,
  "process_model": 1,
  "status": "draft",
  "start_date": "2026-01-15",
  ...
}
```

**Save the `id` as `PROCESS_INSTANCE_ID` for the next steps.**

---

## Step 4: Create Decision Payloads

The "Basic Permit" process model (ID=1) has 3 decision elements:

| Element ID | Title | Description |
|------------|-------|-------------|
| 1 | User id | Authentication/user identification data |
| 2 | Project Information | Project details form data |
| 3 | Permit Requirements | Permit-specific requirements (left empty for external submissions) |

Create all 3 payloads in a single batch request:

### Request

```bash
curl -X POST "{SUPABASE_URL}/rest/v1/process_decision_payload" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '[
    {
      "process_decision_element": 1,
      "process": {PROCESS_INSTANCE_ID},
      "project": {PROJECT_ID},
      "evaluation_data": {
        "provider": "external_system",
        "user_id": "{USER_ID}",
        "email": "user@example.com",
        "authenticated_at": "2026-01-15T10:30:00.000Z",
        "external_system_name": "Your System Name"
      }
    },
    {
      "process_decision_element": 2,
      "process": {PROCESS_INSTANCE_ID},
      "project": {PROJECT_ID},
      "evaluation_data": {
        "title": "Highway 101 Utility Installation",
        "description": "Installation of underground fiber optic cable",
        "sector": "infrastructure",
        "lead_agency": "Department of Transportation",
        "type": "utility_installation",
        "location_text": "Highway 101, San Francisco, CA"
      }
    },
    {
      "process_decision_element": 3,
      "process": {PROCESS_INSTANCE_ID},
      "project": {PROJECT_ID},
      "evaluation_data": {}
    }
  ]'
```

### Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `process_decision_element` | bigint | Yes | Decision element ID (1, 2, or 3) |
| `process` | bigint | Yes | Process instance ID |
| `project` | bigint | Yes | Project ID |
| `evaluation_data` | jsonb | Yes | Form data for the decision element |

### Element 1 (User id) - Evaluation Data Schema

```json
{
  "provider": "external_system",
  "user_id": "string (required)",
  "email": "string (required)",
  "authenticated_at": "ISO 8601 timestamp",
  "external_system_name": "string (optional)"
}
```

### Element 2 (Project Information) - Evaluation Data Schema

This should match the project data. Required fields:

```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "sector": "string (optional)",
  "lead_agency": "string (optional)",
  "type": "string (optional)",
  "location_text": "string (optional)"
}
```

### Element 3 (Permit Requirements)

For external system submissions, this can be left empty (`{}`). The applicant will complete this form in the web application if needed.

### Response

```json
[
  {
    "id": 1001,
    "process_decision_element": 1,
    "process": 456,
    "project": 123,
    "evaluation_data": { ... },
    ...
  },
  {
    "id": 1002,
    "process_decision_element": 2,
    ...
  },
  {
    "id": 1003,
    "process_decision_element": 3,
    ...
  }
]
```

---

## Step 5: Create Case Events

Log the workflow milestones for audit and tracking purposes.

### Create "Project Started" Event

```bash
curl -X POST "{SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "parent_process_id": {PROCESS_INSTANCE_ID},
    "name": "Project Started",
    "description": "Permit application started for project: Highway 101 Utility Installation",
    "type": "project_started",
    "status": "completed",
    "source": "external_system",
    "datetime": "2026-01-15T10:30:00.000Z"
  }'
```

### Create "Form Saved" Events

Create one for each form that was populated:

```bash
# User ID form saved
curl -X POST "{SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "parent_process_id": {PROCESS_INSTANCE_ID},
    "name": "Form Saved",
    "description": "User id form data saved",
    "type": "form_saved",
    "status": "completed",
    "source": "external_system",
    "datetime": "2026-01-15T10:30:01.000Z"
  }'

# Project Information form saved
curl -X POST "{SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: {SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "parent_process_id": {PROCESS_INSTANCE_ID},
    "name": "Form Saved",
    "description": "Project Information form data saved",
    "type": "form_saved",
    "status": "completed",
    "source": "external_system",
    "datetime": "2026-01-15T10:30:02.000Z"
  }'
```

### Case Event Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parent_process_id` | bigint | Yes | Process instance ID |
| `name` | text | Yes | Event name |
| `description` | text | No | Detailed description |
| `type` | text | Yes | Event type (see below) |
| `status` | text | No | `"pending"`, `"in_progress"`, or `"completed"` |
| `source` | text | No | Source system identifier |
| `datetime` | timestamp | No | Event timestamp (defaults to now) |
| `outcome` | text | No | Result (for approval events) |

### Case Event Types

| Type | When to Use |
|------|-------------|
| `project_started` | When permit application is initiated |
| `form_saved` | When form data is saved |
| `submitted_for_approval` | When application is submitted for review |
| `element_approved` | When a decision element is approved |
| `element_rejected` | When a decision element is rejected |
| `project_approved` | When entire application is approved |
| `project_returned` | When application is returned for revision |

---

## Complete Workflow Example

Here's a complete example using shell variables:

```bash
#!/bin/bash

# Configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
EMAIL="applicant@example.com"
PASSWORD="secure-password"

# Step 1: Authenticate
AUTH_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}")

ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.access_token')
USER_ID=$(echo $AUTH_RESPONSE | jq -r '.user.id')

echo "Authenticated as user: ${USER_ID}"

# Step 2: Create Project
PROJECT_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/project" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"title\": \"Highway 101 Utility Installation\",
    \"description\": \"Underground fiber optic cable installation\",
    \"sector\": \"infrastructure\",
    \"current_status\": \"draft\",
    \"user_id\": \"${USER_ID}\"
  }")

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.[0].id // .id')
echo "Created project: ${PROJECT_ID}"

# Step 3: Create Process Instance
PROCESS_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/process_instance" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"parent_project_id\": ${PROJECT_ID},
    \"process_model\": 1,
    \"status\": \"draft\",
    \"start_date\": \"$(date +%Y-%m-%d)\"
  }")

PROCESS_ID=$(echo $PROCESS_RESPONSE | jq -r '.[0].id // .id')
echo "Created process instance: ${PROCESS_ID}"

# Step 4: Create Decision Payloads
PAYLOADS_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/process_decision_payload" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "[
    {
      \"process_decision_element\": 1,
      \"process\": ${PROCESS_ID},
      \"project\": ${PROJECT_ID},
      \"evaluation_data\": {
        \"provider\": \"external_system\",
        \"user_id\": \"${USER_ID}\",
        \"email\": \"${EMAIL}\",
        \"authenticated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
      }
    },
    {
      \"process_decision_element\": 2,
      \"process\": ${PROCESS_ID},
      \"project\": ${PROJECT_ID},
      \"evaluation_data\": {
        \"title\": \"Highway 101 Utility Installation\",
        \"description\": \"Underground fiber optic cable installation\",
        \"sector\": \"infrastructure\"
      }
    },
    {
      \"process_decision_element\": 3,
      \"process\": ${PROCESS_ID},
      \"project\": ${PROJECT_ID},
      \"evaluation_data\": {}
    }
  ]")

echo "Created decision payloads"

# Step 5: Create Case Events
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

curl -s -X POST "${SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"parent_process_id\": ${PROCESS_ID},
    \"name\": \"Project Started\",
    \"description\": \"Permit application started via external system\",
    \"type\": \"project_started\",
    \"status\": \"completed\",
    \"source\": \"external_system\",
    \"datetime\": \"${TIMESTAMP}\"
  }"

curl -s -X POST "${SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"parent_process_id\": ${PROCESS_ID},
    \"name\": \"Form Saved\",
    \"description\": \"Project Information form data saved\",
    \"type\": \"form_saved\",
    \"status\": \"completed\",
    \"source\": \"external_system\",
    \"datetime\": \"${TIMESTAMP}\"
  }"

echo "Created case events"
echo "Done! Project ${PROJECT_ID} created with process instance ${PROCESS_ID}"
```

---

## Submitting for Approval

When the applicant has completed all required forms (including the third decision element if needed), update the statuses to submit for approval:

```bash
# Update process instance status to 'submitted'
curl -X PATCH "${SUPABASE_URL}/rest/v1/process_instance?id=eq.${PROCESS_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "submitted"}'

# Update project status to 'submitted'
curl -X PATCH "${SUPABASE_URL}/rest/v1/project?id=eq.${PROJECT_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"current_status": "submitted"}'

# Log the submission event
curl -X POST "${SUPABASE_URL}/rest/v1/case_event" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"parent_process_id\": ${PROCESS_ID},
    \"name\": \"Submitted for Approval\",
    \"description\": \"Project submitted for approval\",
    \"type\": \"submitted_for_approval\",
    \"status\": \"completed\",
    \"source\": \"external_system\",
    \"datetime\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
  }"
```

---

## Error Handling

Supabase REST API returns standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success (for PATCH) |
| 201 | Created (for POST) |
| 400 | Bad Request - check your JSON payload |
| 401 | Unauthorized - check your access token |
| 403 | Forbidden - RLS policy violation |
| 404 | Not Found - resource doesn't exist |
| 409 | Conflict - duplicate or constraint violation |

Error responses include a message:

```json
{
  "code": "PGRST204",
  "message": "Column 'invalid_field' does not exist",
  "details": null,
  "hint": null
}
```

---

## Row-Level Security (RLS)

The database has RLS policies that restrict access:

- Users can only read/write their own projects (`user_id` must match)
- Process instances are accessible through their parent project
- Decision payloads are accessible through their parent process

Ensure your requests use a valid access token for the correct user account.

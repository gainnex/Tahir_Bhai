# Database Design (Phase 1)

All tables have `id` (primary key), `created_at`, `updated_at`. Tables marked *soft delete* also have `deleted_at`.

## users
| Field | Type | Notes |
|---|---|---|
| name | string | |
| username | string | unique |
| email | string | optional, unique |
| password_hash | string | |
| role | enum | `ADMIN`, `ACCOUNTANT`, `SITE_INCHARGE` |
| is_active | boolean | default true |

## projects *(soft delete)*
| Field | Type | Notes |
|---|---|---|
| code | string | unique, e.g. `PRJ-001` |
| name | string | |
| client_name | string | optional |
| location | string | optional |
| start_date | date | |
| end_date | date | optional |
| status | enum | `ACTIVE`, `ON_HOLD`, `COMPLETED` |
| budget | decimal(14,2) | optional |
| is_head_office | boolean | true only for "Head Office / General" |
| notes | text | optional |

## project_users
Links Site In-charge users to projects. `project_id`, `user_id` (unique pair).

## expense_heads
| Field | Type | Notes |
|---|---|---|
| name | string | unique |
| is_active | boolean | |
| sort_order | int | |

## expense_subheads
| Field | Type | Notes |
|---|---|---|
| head_id | FK → expense_heads | |
| name | string | unique within head |
| is_active | boolean | |

## vendors *(soft delete)*
| Field | Type | Notes |
|---|---|---|
| name | string | |
| type | enum | `SUPPLIER`, `CONTRACTOR`, `OTHER` |
| phone | string | optional |
| ntn | string | optional |
| address | text | optional |
| notes | text | optional |

## workers *(soft delete)*
| Field | Type | Notes |
|---|---|---|
| name | string | |
| cnic | string | optional, format `12345-1234567-1` |
| phone | string | optional |
| trade | enum | `MASON`, `ELECTRICIAN`, `PLUMBER`, `HELPER`, `CARPENTER`, `OTHER` |
| rate_type | enum | `DAILY`, `MONTHLY` |
| rate | decimal(12,2) | |
| default_project_id | FK → projects | optional |
| is_active | boolean | |

## expenses *(soft delete)*
| Field | Type | Notes |
|---|---|---|
| expense_no | string | auto, unique, e.g. `EXP-2026-00001` |
| date | date | |
| project_id | FK → projects | required |
| head_id | FK → expense_heads | required |
| subhead_id | FK → expense_subheads | required |
| amount | decimal(14,2) | > 0 |
| payment_mode | enum | `CASH`, `BANK_TRANSFER`, `CHEQUE`, `JAZZCASH`, `EASYPAISA` |
| cheque_no | string | required if CHEQUE |
| paid_to | string | required (free text, auto-filled from vendor/worker) |
| vendor_id | FK → vendors | optional |
| worker_id | FK → workers | optional |
| reference_no | string | optional bill number |
| description | text | required |
| status | enum | `PENDING`, `APPROVED`, `REJECTED` |
| rejection_reason | text | required if REJECTED |
| approved_by | FK → users | optional |
| approved_at | datetime | optional |
| split_group_id | uuid | optional; same value for all lines of a split bill |
| created_by | FK → users | |

Indexes: `(project_id, date)`, `(head_id, date)`, `status`, `vendor_id`, `worker_id`.

## attachments
| Field | Type | Notes |
|---|---|---|
| expense_id | FK → expenses | |
| file_name | string | original name |
| file_path | string | stored path |
| mime_type | string | image/jpeg, image/png, application/pdf |
| size_bytes | int | ≤ 5 MB |
| uploaded_by | FK → users | |

For a split bill, the receipt is attached to every line in the group (same file, multiple rows) or to the group via the first line — pick one and stay consistent.

## activity_logs
| Field | Type | Notes |
|---|---|---|
| user_id | FK → users | |
| action | enum | `CREATE`, `UPDATE`, `DELETE`, `APPROVE`, `REJECT`, `LOGIN` |
| entity_type | string | e.g. `expense` |
| entity_id | int | |
| changes | json | old and new values |

## settings
Key–value table: `company_name`, `company_address`, `logo_path`, `auto_approve_privileged` (bool), `currency_label`.

## Relationships (summary)

```
projects 1──* expenses *──1 expense_heads 1──* expense_subheads
expenses *──1 vendors (optional)
expenses *──1 workers (optional)
expenses 1──* attachments
users *──* projects (via project_users)
```

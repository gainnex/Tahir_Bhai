# Prompt for AI Coding CLI (Claude Code / similar)

**How to use:** put all the `.md` files from this folder in the root of an empty project folder (e.g. inside a `docs/` folder), open the CLI there, and paste the prompt below. Change the tech stack line if you prefer something else (e.g. Laravel + MySQL).

---

```text
You are building Phase 1 (MVP) of a "Project Expense Manager" web application for a
Pakistani construction / project-based company. The full specification is in these files —
read ALL of them before writing any code, and treat them as the source of truth:

- docs/README.md      (scope and rules)
- docs/FEATURES.md    (features by module)
- docs/DATABASE.md    (tables and fields)
- docs/SCREENS.md     (pages, navigation, user flows)
- docs/ROADMAP.md     (things NOT to build now)

Build ONLY what is in Phase 1. Do not build anything listed in ROADMAP.md, but keep the
design clean so those can be added later.

TECH STACK
- Next.js (App Router) + TypeScript
- Prisma ORM with PostgreSQL (SQLite allowed for local dev via env switch)
- Auth: username + password with bcrypt hashing, session cookies (e.g. Auth.js credentials
  provider or iron-session)
- UI: Tailwind CSS + shadcn/ui, Recharts for charts
- Excel export: exceljs ; PDF export: @react-pdf/renderer or pdfkit
- File uploads stored on local disk under /uploads (path configurable via env), served
  only to logged-in users
- Validation with zod on both client and server

KEY BUSINESS RULES (must be enforced on the server, not just the UI)
1. Every expense must have date, project, head, sub-head, amount > 0, payment mode,
   paid_to and description. Cheque number required when payment mode is CHEQUE.
2. Sub-head must belong to the chosen head. Disabled heads/sub-heads cannot be used for
   new expenses.
3. No new expenses on projects with status COMPLETED.
4. Site In-charge users can only see and create expenses for projects assigned to them,
   and cannot approve.
5. Status flow: PENDING -> APPROVED or REJECTED (reason required). Approved expenses are
   locked; only ADMIN can edit them, and every change is written to activity_logs.
   If the setting auto_approve_privileged is ON, expenses created by ADMIN/ACCOUNTANT are
   approved automatically.
6. Only APPROVED expenses count in totals, dashboard and reports (reports may have an
   "include pending" toggle).
7. Split bills: lines must sum exactly to the bill total; save as separate expense rows
   sharing a split_group_id.
8. Soft delete everywhere (deleted_at); deleted records never appear in totals.
9. Money stored as decimal, never float. Display as "PKR 1,250,000". Dates DD-MM-YYYY.

WORK PLAN — do it in this order and stop after each step to show me what was done
1. Project setup, Prisma schema from DATABASE.md, migrations, and a seed script that
   creates: one ADMIN user (admin / admin123, must be changeable), the "Head Office /
   General" project, all default expense heads and sub-heads from FEATURES.md, and some
   sample projects, vendors, workers and expenses for testing.
2. Auth, role-based access middleware, app layout with sidebar per SCREENS.md.
3. Settings: company info, users, expense heads/sub-heads management.
4. Projects (list, form, assign site in-charges, profile page).
5. Vendors and workers (list, form, profile pages).
6. Expenses: form with dependent head/sub-head dropdown, attachments, split bill, list
   with filters and filtered total, detail page, pending approvals page, labour payment form.
7. Activity log (written automatically by a shared service/helper) and its viewer.
8. Dashboard.
9. The 5 reports with filters, totals, Excel and PDF export (PDF has company name/logo).
10. Final pass: README with setup/run instructions, .env.example, a backup script
    (pg_dump daily via cron) and basic tests for the business rules above.

QUALITY
- Keep code simple and readable; put business logic in a server-side service layer,
  not inside UI components.
- Mobile-friendly expense entry form (site staff use phones).
- Handle errors with clear messages to the user.
- If anything in the spec is unclear or contradictory, ask me before guessing.
```

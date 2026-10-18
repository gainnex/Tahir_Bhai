# Project Expense Manager — Phase 1 (MVP)

A web app for a construction / project-based company to record every expense against a
project and an expense head, approve it, and see **how much each project has spent, and on what**.

The full specification is in [`docs/`](docs/README.md) (features, database, screens, roadmap).

## Features

- **Projects** with optional budgets, a built-in *Head Office / General* cost center, **sub offices**
  (branch cost centers for their overheads and staff salaries), budget bars
  (green < 80 %, amber 80–100 %, red > 100 %) and a profile page with spend by head.
- **Expense heads & sub-heads** (9 heads / 33 sub-heads pre-loaded), add / rename / disable.
- **Expenses** with receipt upload (JPG/PNG/PDF, 5 MB each, photos auto-shrunk on phones), five
  payment modes, vendor/worker picker, **split bills** across projects/heads, list with filters and
  filtered total, Excel/PDF export.
- **Taxes**: optional GST (included in the amount) and withholding tax (deducted from the
  payment) on each expense; net paid = amount − WHT. A split bill's taxes are shared across its
  lines in proportion to their amounts.
- **Approval**: Pending → Approved / Rejected (reason required). Approved entries are locked
  (only Admin can edit, always logged). Optional auto-approve for Admin/Accountant entries.
- **Vendors** and an **employee register** (labour, permanent and part-time staff) with labour
  payments (days × rate helper) and advances.
- **Attendance (office)**: mark each employee Present / Half day / Absent / Leave per day (one tap
  each, "mark the rest present"), monthly register (P/H/A/L grid). Site In-charges mark employees
  whose default project is assigned to them.
- **Wage sheet** per month (Admin / Accountant): attendance × rate, plus **benefits / rewards /
  incentives**, less **deductions / advance recovery**, less approved labour payments = balance due;
  outstanding advance per employee, totals per cost center. Excel export; the PDF has a signature
  column. **Post wages** pays the selected balances in one go: one labour payment each ("Salaries" for
  monthly staff, "Daily wages" for daily-rate workers), charged to the employee's cost center
  (project / sub office / head office).
- **Client billing**: running bills per client project (`BIL-YYYY-NNNNN`, with the client's own
  reference) — claimed, then **verified** by the client at an approved amount (≤ claimed); **receipts**
  (`RCT-YYYY-NNNNN`) against verified bills, with income tax deducted by the client. Printable bill and
  receipt PDFs on the letterhead (amount in words, lakh / crore). Receivables on the dashboard and the
  project page.
- **Project profitability** report: contract value, claimed vs verified billing, received, receivable,
  cost and margin (= verified billing − cost) per project, overheads (Head Office / sub offices)
  separately and the net company result.
- **Cash in hand** per employee: opening balance, funds given (cash / online transfer), cash
  returned, and expenses marked *Paid from* that employee. Running-balance statement per employee;
  an employee whose login is linked sees their own.
- **Dashboard** and **7 reports** (Project Cost Summary, Expense Head, Project Ledger, Employee
  Expenses, Vendors with GST/WHT, Tax report per payee with NTN, Project Profitability) with Excel and PDF export (company name, address and logo on the PDF).
- **Users & roles**: Admin, Accountant, Site In-charge (sees and enters only for assigned projects).
- **Activity log** of every create / edit / approve / reject / delete / login with old → new values.
- Soft delete everywhere, exact decimal money (never floats), `PKR 1,250,000`, dates `DD-MM-YYYY`.

## Tech stack

Next.js 16 (App Router) + TypeScript · Prisma 6 · PostgreSQL (SQLite for local dev) ·
iron-session + bcrypt · Tailwind CSS 4 with shadcn/ui-style components · Recharts · zod ·
exceljs · @react-pdf/renderer · Vitest.

---

## Quick start (local development, SQLite — no database server needed)

Requirements: **Node.js 20+** (tested on 25).

```bash
cp .env.example .env
# edit .env: set DATABASE_PROVIDER=sqlite and DATABASE_URL=file:./dev.db
#            and a SESSION_SECRET of 32+ random characters (openssl rand -base64 32)
npm install
npm run db:setup      # create tables + seed reference and sample data
npm run dev           # http://localhost:3000
```

### Logins created by the seed

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `admin123` | Director / Admin | |
| `accountant` | `password123` | Accountant | sample data only |
| `site1` | `password123` | Site In-charge | assigned to PRJ-001, PRJ-003 |
| `site2` | `password123` | Site In-charge | assigned to PRJ-002 |

The seed always creates the admin user, the Head Office cost center, the default heads/sub-heads
and settings. Sample users, projects, vendors, workers and ~100 expenses are added only to an
empty database; skip them with `SEED_SAMPLE_DATA=false npm run db:seed`.
**Delete or deactivate the sample users before going live.**

---

## Production setup (PostgreSQL)

1. **Database** (PostgreSQL 14+):
   ```sql
   CREATE USER pem WITH PASSWORD 'choose-a-strong-password';
   CREATE DATABASE project_expense_manager OWNER pem;
   ```
2. **Configure** — copy `.env.example` to `.env` and set:

   | Variable | Example | Purpose |
   |---|---|---|
   | `DATABASE_PROVIDER` | `postgresql` | `postgresql` (production) or `sqlite` (dev) |
   | `DATABASE_URL` | `postgresql://pem:…@localhost:5432/project_expense_manager?schema=public` | connection string |
   | `SESSION_SECRET` | 32+ random chars | encrypts the login cookie — keep secret, never commit |
   | `SESSION_COOKIE_SECURE` | `true` | set `true` when served over HTTPS |
   | `UPLOAD_DIR` | `/var/lib/pem/uploads` | receipts + logo (outside the web root; served only to logged-in users) |
   | `APP_URL` | `https://expenses.example.com` | makes expense numbers clickable in Excel exports |
   | `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | `/var/backups/pem`, `30` | used by `scripts/backup.sh` |

3. **Install, migrate, seed, build, start**:
   ```bash
   npm ci
   npm run db:migrate    # applies prisma/migrations (safe to re-run on every deploy)
   npm run db:seed       # first deploy only; add SEED_SAMPLE_DATA=false for a clean start
   npm run build
   npm start             # serves on port 3000 (PORT=… to change)
   ```
4. **Keep it running** with systemd or PM2 (e.g. `pm2 start npm --name pem -- start`) and put
   it behind Nginx/Caddy with HTTPS. Raise the proxy's upload limit to ~30 MB
   (Nginx: `client_max_body_size 30m;`) so several receipts can be sent at once.
5. Log in as `admin`, change the password, then fill in **Settings → Company** (name, address,
   logo) and create the real users.

### Deploying updates

```bash
git pull && npm ci && npm run db:migrate && npm run build && pm2 restart pem
```

---

## Backups (daily)

`scripts/backup.sh` writes a compressed `pg_dump` of the database **and** a `tar.gz` of the
upload folder (receipts) to `BACKUP_DIR`, and deletes backups older than `BACKUP_KEEP_DAYS`.
It needs the PostgreSQL client tools (`pg_dump`) on the server.

```bash
./scripts/backup.sh          # test it once by hand
crontab -e                   # then schedule it, e.g. every night at 02:30:
30 2 * * * /opt/project-expense-manager/scripts/backup.sh >> /var/log/pem-backup.log 2>&1
```

**Copy the backup folder off the server** (another machine, cloud storage, or USB drive) —
a backup on the same disk does not survive a disk failure. Test a restore occasionally:

```bash
gunzip -c backups/db-2026-10-15_0230.sql.gz | psql "postgresql://pem:…@localhost:5432/project_expense_manager"
tar -xzf backups/uploads-2026-10-15_0230.tar.gz -C /var/lib/pem/   # restores the uploads folder
```

(Restore into an empty database; drop and recreate it first if needed.)

---

## Business rules and where they are enforced

All rules are enforced on the **server**, in the service layer (`src/server/services/`); the UI
only mirrors them. Each one is covered by tests in `tests/`.

| # | Rule | Where |
|---|---|---|
| 1 | Required fields, amount > 0, cheque number for cheques | `src/lib/validation/expenses.ts` (zod, used by client **and** server) |
| 2 | Sub-head belongs to head; disabled heads/sub-heads not usable for new entries | `expense-service.ts` → `validateAllocation` |
| 3 | No new expenses on Completed projects | `expense-service.ts` → `validateAllocation` |
| 4 | Site In-charge: only assigned projects, cannot approve | `project-service.ts` → `assertProjectAccess`, `expenseScope`; `src/lib/permissions.ts` |
| 5 | Pending → Approved/Rejected (reason); approved locked except Admin (logged); auto-approve setting | `src/lib/expense-rules.ts`, `expense-service.ts` |
| 6 | Only Approved count in totals (reports can include pending) | `totals.ts` → `COUNTABLE`, `report-service.ts` |
| 7 | Split lines sum exactly to the bill; rows share `split_group_id` | `splitExpenseSchema` (integer-paisa maths), `createExpenses` |
| 8 | Soft delete; deleted rows never in totals | every service filters `deletedAt: null` |
| 9 | Decimal money, `PKR 1,250,000`, `DD-MM-YYYY` | Prisma `Decimal`, `src/lib/money.ts`, `src/lib/format.ts` |

Other decisions made during the build:

- A split bill is approved, rejected and deleted **as one bill**; editing changes one line.
- Projects, vendors and workers that already have expenses cannot be deleted (reports would
  lose them) — mark the project *Completed* / the worker *inactive* instead.
- The last active Admin cannot be demoted or deactivated.
- Labour advances are expenses with sub-head **"Advance to labour"** under **"Labour"** —
  keep those names if you rename things.
- Expense numbers `EXP-YYYY-NNNNN` restart each year and are never reused.
- Cash in hand (`cash-service.ts`): balance = opening + given − returned − **approved** expenses
  paid from it. Only Admin / Accountant record cash entries (`CSH-YYYY-NNNNN`). A Site In-charge can
  only mark expenses as paid from their **own** cash (their login linked on the employee record).
  A negative balance means the company owes the employee. Withholding tax on an expense paid
  from cash stays with the employee, so the balance goes down by the net paid.
- Wages (`src/lib/payroll.ts`, `payroll-service.ts`): daily rate × (present + ½ half days) — leave
  and unmarked days unpaid; monthly rate = salary − (absent + ½ half days) × salary ÷ days in the
  month — leave and unmarked days paid. "Paid" = approved Workers-head expenses for that worker in
  the month, excluding "Advance to labour"; advance balance = advances to month end − advance
  recoveries. Attendance can't be marked for future dates. Joining / leaving mid-month is not
  pro-rated.
- Posting wages (`postWages`) recalculates every amount on the server and checks the whole batch
  first: anyone with nothing due, no cost center, a Completed cost center or a pending labour
  payment that month stops the batch, so nothing is paid twice. Cheques are entered one by one.
- Billing (`billing-service.ts`, Admin / Accountant): receipts only on verified bills, dated on/after
  the bill; received + tax deducted ≤ approved; the approved amount can't go below what is credited
  and the claimed amount can't go below the approved; bills with receipts can't be deleted,
  un-verified or moved to another project. Bills are for client projects, not Head Office / sub offices.
- Taxes: `amount` stays the gross bill (the project's cost, used by every total); `gst_amount`
  and `wht_amount` are optional parts of it, each ≤ the amount (`expenses.ts` zod schemas).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build / server |
| `npm test` | all tests on a throw-away SQLite DB (`prisma/sqlite/test.db`) |
| `TEST_DATABASE_URL=postgresql://… npm test` | same tests on PostgreSQL — **that database is wiped** |
| `npm run lint` | ESLint |
| `npm run db:setup` | migrate + generate + seed |
| `npm run db:migrate` | apply migrations (SQLite dev: `db push`) |
| `npm run db:migrate:new -- --name <change>` | create a new migration after editing `prisma/schema.prisma` (Postgres) |
| `npm run db:seed` | seed reference (+ sample) data |
| `npm run db:studio` | browse the database in Prisma Studio |

`prisma/schema.prisma` targets PostgreSQL and is the source of truth.
`scripts/prisma.mjs` derives an SQLite copy (`prisma/sqlite/`) when `DATABASE_PROVIDER=sqlite`.

## Project structure

```
docs/                      specification (Phase 1 scope, features, DB, screens, roadmap)
prisma/                    schema.prisma, migrations/, seed.ts
scripts/                   prisma.mjs (provider switch), backup.sh
src/app/(app)/             pages behind login (dashboard, expenses, projects, …)
src/app/api/               receipt download, logo, report exports
src/app/login, change-password
src/components/            UI components (ui/ = shadcn-style primitives)
src/lib/                   shared, client-safe code: validation (zod), money, formatting, permissions
src/server/services/       business logic — all rules live here
src/server/reports/        Excel + PDF writers
src/proxy.ts               optimistic auth/role redirects (real checks are in the services)
tests/                     Vitest tests for the business rules
```

## Not in Phase 1

Double-entry accounting, payslips, purchase orders / inventory, travel workflows, retention money,
tax filing / tax rates, bank reconciliation, mobile app, Urdu UI — see [`docs/ROADMAP.md`](docs/ROADMAP.md).
The data model (every expense has project + head + sub-head) is ready for those phases.

# Phase 1 Features

## 1. Projects

- Create / edit a project with: **code** (unique), **name**, client name, location, start date, end date (optional), status (`Active`, `On Hold`, `Completed`), budget amount (optional), notes.
- A built-in, non-deletable cost center called **"Head Office / General"** for office overheads.
- Project list with search and status filter.
- **Project profile page** showing:
  - Total spent (approved expenses only)
  - Budget and remaining budget (if a budget is set), with % used
  - Spend by expense head (table + simple bar or pie chart)
  - Latest 10 expenses
- Projects with status `Completed` are locked: no new expenses can be posted.

## 2. Expense heads & sub-heads

- Admin can add, rename and disable heads and sub-heads. Disabled items stay on old records but cannot be picked for new ones.
- Pre-loaded defaults:

| Head | Sub-heads |
|---|---|
| Labour | Daily wages, Contractor payments, Overtime, Advance to labour |
| Materials | Cement, Steel, Electrical, Plumbing, Hardware, Material transport |
| Travelling | Fare, Fuel, Vehicle rent, Toll |
| TA/DA | Daily allowance, Local conveyance, Meal allowance |
| Accommodation | Hotel, Guest house, Site camp rent |
| Equipment & Machinery | Rental, Repair, Machinery fuel |
| Site Overheads | Utilities, Security, Site office, Communication |
| Office Overheads | Rent, Utilities, Admin salaries, Stationery |
| Miscellaneous | Other |

## 3. Expenses (core module)

- **Mandatory fields:** date, project, head, sub-head, amount, payment mode, paid to, description.
- Optional: reference / bill number, linked vendor or worker, receipt attachments.
- **Payment modes:** Cash, Bank Transfer, Cheque, JazzCash, Easypaisa. Cheque shows a cheque-number field.
- **Attachments:** upload one or more images (JPG/PNG) or PDFs per expense, max 5 MB each. View and download from the expense page.
- **Status:** `Pending` → `Approved` or `Rejected` (with reason).
  - Only `Approved` expenses count in totals and reports (reports may offer a toggle to include pending).
  - Approved expenses are locked; only Admin can unlock/edit, and the change is logged.
  - Rejected expenses can be edited and resubmitted by the person who created them.
- **Split expense:** one bill can be split across several projects and/or heads. Split lines must add up to the bill total. Each line is stored as its own expense row linked by a shared `split_group_id`.
- **List & filter:** by date range, project, head, sub-head, vendor/payee, created by, status, payment mode, amount range. Show the total of filtered rows.

## 4. Vendors / payees

- Simple register: name, type (Supplier, Contractor/Thekedar, Other), phone, NTN (optional), address, notes.
- Vendor page shows all expenses paid to that vendor and total paid.
- No payables or bill tracking in Phase 1.

## 5. Labour (simplified)

- Worker register: name, CNIC, phone, trade (Mason, Electrician, Plumber, Helper, Carpenter, Other), rate type (Daily/Monthly), rate, default project, active flag.
- **Labour payment** is just an expense under the Labour head, with the worker selected. Form pre-fills head = Labour and "paid to" = worker name.
- Optional quick calculator on the payment form: days × daily rate = amount.
- Worker page shows payment history and total paid, filterable by project.
- **Advances:** an expense with sub-head "Advance to labour" is shown separately on the worker page as "Advances given". (Recovery tracking is Phase 2.)

## 6. Users & roles

| Role | Can do |
|---|---|
| **Admin** | Everything: settings, users, heads, projects, approve, edit approved entries, all reports |
| **Accountant** | Enter and approve expenses, manage vendors and workers, all reports |
| **Site In-charge** | Enter expenses only for projects assigned to them; see their own entries and their projects' reports; cannot approve |

- Login with email/username + password (hashed). Admin creates users and resets passwords.
- Admin assigns projects to Site In-charge users.

## 7. Approval (one step)

1. Site In-charge (or anyone) creates an expense → status `Pending`.
2. Admin or Accountant opens **Pending Approvals**, reviews receipt, and clicks **Approve** or **Reject** (reason required).
3. Approved entry is locked.
- Entries created by Admin/Accountant can be auto-approved (setting, default ON).

## 8. Dashboard

- Total spend: this month and this year
- Spend by project (bar chart, top 10)
- Spend by expense head (pie/donut chart)
- Projects over budget or above 80% of budget
- Count of pending approvals (link to the list)
- Latest 10 expenses
- Site In-charge sees the same dashboard limited to their projects.

## 9. Reports

All reports: filter by date range and project (plus extra filters noted), show totals, export to **Excel (.xlsx)** and **PDF**.

| Report | Shows |
|---|---|
| Project cost summary | One row per project; columns for each head; total; budget; remaining |
| Expense head report | For one head (or all): breakdown by sub-head and by project |
| Project ledger | Every expense of one project in date order, with running total and receipt links |
| Labour payments report | Payments per worker and per project, with advances shown separately |
| Vendor report | Total paid per vendor, with drill-down to entries |

## 10. Activity log & backup

- Log every create / edit / approve / reject / delete with user, time, record and old → new values.
- Admin can view and filter the log.
- Soft delete only (records are marked deleted, not removed).
- Document a simple daily database backup (cron script) in the deployment notes.

## 11. Settings

- Company name, logo (used on PDF reports), address
- Auto-approve for Admin/Accountant entries (on/off)
- Default currency label (PKR)

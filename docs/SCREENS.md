# Screens & User Flows (Phase 1)

## Navigation (sidebar)

- Dashboard
- Expenses → All Expenses · New Expense · Pending Approvals
- Projects
- Labour → Workers · Labour Payment
- Vendors
- Reports → Project Cost Summary · Expense Head · Project Ledger · Labour Payments · Vendors
- Settings *(Admin)* → Company · Users · Expense Heads · Activity Log

Site In-charge sees only: Dashboard, Expenses (own), Projects (assigned), Labour, Reports (assigned projects).

## Screens

| # | Screen | Key elements |
|---|---|---|
| 1 | Login | Username, password |
| 2 | Dashboard | KPI cards (month, year, pending), charts, over-budget list, latest entries |
| 3 | Expense list | Filters bar, table, filtered total, export button |
| 4 | New / edit expense | Form; head → sub-head dependent dropdown; vendor/worker picker fills "paid to"; file upload; "Split this bill" toggle |
| 5 | Expense detail | All fields, receipts preview, status, history, Approve/Reject buttons (if allowed) |
| 6 | Pending approvals | Table with quick view of receipt, Approve / Reject inline |
| 7 | Project list | Search, status filter, spent vs budget bar |
| 8 | Project form | Fields from `DATABASE.md`; assign Site In-charges |
| 9 | Project profile | Totals, budget usage, spend-by-head chart, latest expenses, "View ledger" link |
| 10 | Worker list / form / profile | Profile shows payments, advances, totals by project |
| 11 | Labour payment | Expense form pre-set to Labour head, worker required, days × rate helper |
| 12 | Vendor list / form / profile | Profile shows all payments and total |
| 13 | Reports (5) | Filters, table, totals, Excel + PDF export |
| 14 | Users | Create, edit, deactivate, reset password, role |
| 15 | Expense heads | Tree of heads and sub-heads, add / rename / disable |
| 16 | Activity log | Filter by user, date, entity |
| 17 | Company settings | Name, address, logo, auto-approve toggle |

## Flow 1 — Site expense with receipt

1. Site In-charge logs in → **New Expense**.
2. Picks project (only assigned ones), head, sub-head, amount, payment mode, paid to, description.
3. Takes/attaches photo of receipt → Save. Status = `Pending`.
4. Accountant opens **Pending Approvals** → views receipt → Approve.
5. Expense is locked and now counts in project totals.

## Flow 2 — Split bill

1. Accountant enters a fuel bill of PKR 30,000 → turns on **Split this bill**.
2. Adds lines: Site A / Travelling / Fuel 18,000 and Site B / Travelling / Fuel 12,000.
3. System checks lines total = 30,000 → saves 2 linked expense rows sharing one receipt.

## Flow 3 — Labour payment

1. **Labour Payment** → select worker (rate fills in) → select project.
2. Enter days worked (e.g. 6 × 1,500) → amount 9,000 → Save.
3. Shows on worker profile and in Labour Payments report.

## Flow 4 — Monthly review by owner

1. Admin opens **Dashboard** → sees projects near/over budget.
2. Opens **Project Cost Summary** for the month → exports PDF for the meeting.
3. Drills into a project → **Project Ledger** to check individual entries and receipts.

## UI guidelines

- Clean, simple, desktop-first but usable on a phone browser (site staff will use phones).
- Large buttons and inputs on the expense form.
- Amounts right-aligned with thousands separators.
- Colour status badges: Pending (amber), Approved (green), Rejected (red).
- Budget bar: green < 80%, amber 80–100%, red > 100%.

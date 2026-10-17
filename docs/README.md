# Project Expense Manager — MVP (Phase 1)

A simple web application for a construction / project-based company to record every expense against a project and an expense head, and see at a glance **how much each project has spent, and on what**.

This is the **basic version**. Advanced accounting, payroll, purchasing and travel workflows are deliberately left for later phases (see `ROADMAP.md`).

## Goals of Phase 1

1. Every expense is linked to one project (or to "Head Office / General").
2. Every expense is tagged with an expense head and sub-head.
3. Receipts can be attached to expenses.
4. Simple approval: site staff enter, admin/accountant approves.
5. Reports show spend per project, per head, and a full project ledger.
6. Reports export to Excel and PDF.

## Documents in this folder

| File | Purpose |
|---|---|
| `README.md` | Overview and scope (this file) |
| `FEATURES.md` | Detailed list of Phase 1 features by module |
| `DATABASE.md` | Tables, fields and relationships |
| `SCREENS.md` | Pages, navigation and user flows |
| `ROADMAP.md` | Features postponed to later phases |
| `CLI_PROMPT.md` | Ready-to-paste prompt for an AI coding CLI to build the app |

## In scope (Phase 1)

- Projects (with optional budget) + a Head Office cost center
- Customizable expense heads and sub-heads
- Expense entry with receipt upload and payment mode
- Simple vendor / payee list
- Simple labour register and labour payments (as expenses)
- Users with 3 roles: Admin, Accountant, Site In-charge
- Simple one-step approval
- Dashboard + 5 core reports, export to Excel/PDF
- Activity log

## Out of scope (Phase 1)

Double-entry accounting, attendance & payroll, purchase orders/GRN/inventory, travel requests & TA/DA policy rules, client invoicing, tax, bank reconciliation, mobile app, multi-company. See `ROADMAP.md`.

## General rules

- Currency: **PKR**, shown as `PKR 1,250,000` (no decimals in display unless needed).
- Date format: `DD-MM-YYYY`.
- Language: English (Urdu in a later phase).

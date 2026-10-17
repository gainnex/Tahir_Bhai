// Seed script: reference data (always) + sample data (only into an empty database).
//
//   npm run db:seed
//
// Creates the ADMIN user "admin" / "admin123",
// the "Head Office / General" cost center, default expense heads/sub-heads and settings.
// When the database has no expenses yet it also adds sample users, projects, vendors,
// workers and expenses for testing (skip with SEED_SAMPLE_DATA=false).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type PaymentMode, type ExpenseStatus } from "@prisma/client";
import {
  ADVANCE_SUBHEAD,
  DEFAULT_HEADS,
  DEFAULT_SETTINGS,
  HEAD_OFFICE_CODE,
  HEAD_OFFICE_NAME,
  LABOUR_HEAD,
} from "../src/lib/defaults";

const prisma = new PrismaClient();
const D = (v: number | string) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function seedReferenceData() {
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrator",
      username: "admin",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
    },
  });

  await prisma.project.upsert({
    where: { code: HEAD_OFFICE_CODE },
    update: {},
    create: {
      code: HEAD_OFFICE_CODE,
      name: HEAD_OFFICE_NAME,
      startDate: day("2026-01-01"),
      status: "ACTIVE",
      isHeadOffice: true,
      notes: "Built-in cost center for office overheads. Cannot be deleted.",
    },
  });

  for (const [i, h] of DEFAULT_HEADS.entries()) {
    const head = await prisma.expenseHead.upsert({
      where: { name: h.name },
      update: {},
      create: { name: h.name, sortOrder: (i + 1) * 10 },
    });
    for (const name of h.subheads) {
      await prisma.expenseSubhead.upsert({
        where: { headId_name: { headId: head.id, name } },
        update: {},
        create: { headId: head.id, name },
      });
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  return admin;
}

// Small deterministic PRNG so the sample data is the same on every run.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function seedSampleData(adminId: number) {
  if ((await prisma.expense.count()) > 0) {
    console.log("Expenses already exist — skipping sample data.");
    return;
  }
  const rand = rng(42);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const pw = await bcrypt.hash("password123", 10);
  const accountant = await prisma.user.create({
    data: { name: "Bilal Ahmed", username: "accountant", passwordHash: pw, role: "ACCOUNTANT" },
  });
  const site1 = await prisma.user.create({
    data: { name: "Imran Khan", username: "site1", passwordHash: pw, role: "SITE_INCHARGE" },
  });
  const site2 = await prisma.user.create({
    data: { name: "Asif Raza", username: "site2", passwordHash: pw, role: "SITE_INCHARGE" },
  });

  const headOffice = await prisma.project.findUniqueOrThrow({ where: { code: HEAD_OFFICE_CODE } });
  const p1 = await prisma.project.create({
    data: {
      code: "PRJ-001",
      name: "Gulberg Residency Tower",
      clientName: "Gulberg Developers",
      location: "Lahore",
      startDate: day("2026-01-10"),
      status: "ACTIVE",
      budget: D(12_000_000),
    },
  });
  const p2 = await prisma.project.create({
    data: {
      code: "PRJ-002",
      name: "DHA Phase 6 Villas",
      clientName: "Private client",
      location: "Karachi",
      startDate: day("2026-02-01"),
      status: "ACTIVE",
      budget: D(3_500_000), // deliberately small so it shows as near/over budget
    },
  });
  const p3 = await prisma.project.create({
    data: {
      code: "PRJ-003",
      name: "Motorway Service Area",
      clientName: "NHA",
      location: "M-2, Kallar Kahar",
      startDate: day("2026-03-15"),
      status: "ON_HOLD",
    },
  });
  const p4 = await prisma.project.create({
    data: {
      code: "PRJ-004",
      name: "Faisalabad Warehouse",
      clientName: "Textile Mills Ltd",
      location: "Faisalabad",
      startDate: day("2025-09-01"),
      endDate: day("2026-04-30"),
      status: "COMPLETED",
      budget: D(2_000_000),
    },
  });

  await prisma.projectUser.createMany({
    data: [
      { projectId: p1.id, userId: site1.id },
      { projectId: p3.id, userId: site1.id },
      { projectId: p2.id, userId: site2.id },
    ],
  });

  const vendors = await Promise.all(
    [
      { name: "Lucky Cement Dealer", type: "SUPPLIER" as const, phone: "0300-1234567" },
      { name: "Amreli Steel Traders", type: "SUPPLIER" as const, phone: "0321-7654321", ntn: "1234567-8" },
      { name: "Ustad Rafiq Thekedar", type: "CONTRACTOR" as const, phone: "0333-1112223" },
      { name: "PSO Filling Station", type: "OTHER" as const },
      { name: "City Electric Store", type: "SUPPLIER" as const, address: "Hall Road, Lahore" },
    ].map((data) => prisma.vendor.create({ data })),
  );

  const workers = await Promise.all(
    [
      { name: "Muhammad Aslam", cnic: "35202-1234567-1", trade: "MASON" as const, rate: 2000, projectId: p1.id },
      { name: "Ghulam Rasool", cnic: "35202-7654321-3", trade: "HELPER" as const, rate: 1200, projectId: p1.id },
      { name: "Shahid Iqbal", trade: "ELECTRICIAN" as const, rate: 2500, projectId: p2.id },
      { name: "Nadeem Abbas", trade: "PLUMBER" as const, rate: 2200, projectId: p2.id },
      { name: "Javed Akhtar", trade: "CARPENTER" as const, rate: 60000, projectId: p1.id, monthly: true },
    ].map((w) =>
      prisma.worker.create({
        data: {
          name: w.name,
          cnic: w.cnic,
          trade: w.trade,
          rateType: w.monthly ? "MONTHLY" : "DAILY",
          rate: D(w.rate),
          defaultProjectId: w.projectId,
        },
      }),
    ),
  );

  const heads = await prisma.expenseHead.findMany({ include: { subheads: true } });
  const head = (name: string) => heads.find((h) => h.name === name)!;
  const sub = (headName: string, subName: string) =>
    head(headName).subheads.find((s) => s.name === subName)!;

  let seq = 0;
  type Row = {
    date: string;
    projectId: number;
    head: string;
    sub: string;
    amount: number;
    mode?: PaymentMode;
    paidTo: string;
    description: string;
    vendorId?: number;
    workerId?: number;
    createdById?: number;
    status?: ExpenseStatus;
    rejectionReason?: string;
    splitGroupId?: string;
  };
  const add = async (r: Row) => {
    seq += 1;
    const status = r.status ?? "APPROVED";
    const mode = r.mode ?? "CASH";
    const createdById = r.createdById ?? accountant.id;
    await prisma.expense.create({
      data: {
        expenseNo: `EXP-2026-${String(seq).padStart(5, "0")}`,
        date: day(r.date),
        projectId: r.projectId,
        headId: head(r.head).id,
        subheadId: sub(r.head, r.sub).id,
        amount: D(r.amount),
        paymentMode: mode,
        chequeNo: mode === "CHEQUE" ? `${100000 + seq}` : null,
        paidTo: r.paidTo,
        vendorId: r.vendorId,
        workerId: r.workerId,
        description: r.description,
        status,
        rejectionReason: status === "REJECTED" ? r.rejectionReason ?? "Receipt missing" : null,
        approvedById: status === "APPROVED" ? adminId : null,
        approvedAt: status === "APPROVED" ? day(r.date) : null,
        splitGroupId: r.splitGroupId,
        createdById,
      },
    });
  };

  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const dateIn = (m: string) => {
    const maxDay = m === "2026-10" ? 13 : 28;
    return `${m}-${String(1 + Math.floor(rand() * maxDay)).padStart(2, "0")}`;
  };

  // Materials, travel, overheads on the active projects
  for (const m of months) {
    for (const p of [p1, p2]) {
      const siteUser = p.id === p1.id ? site1.id : site2.id;
      await add({
        date: dateIn(m), projectId: p.id, head: "Materials", sub: "Cement",
        amount: 150_000 + Math.round(rand() * 20) * 5_000, mode: "BANK_TRANSFER",
        paidTo: vendors[0].name, vendorId: vendors[0].id, description: "Cement bags for slab",
      });
      await add({
        date: dateIn(m), projectId: p.id, head: "Materials", sub: "Steel",
        amount: 200_000 + Math.round(rand() * 30) * 5_000, mode: "CHEQUE",
        paidTo: vendors[1].name, vendorId: vendors[1].id, description: "Steel bars 60 grade",
      });
      await add({
        date: dateIn(m), projectId: p.id, head: "Travelling", sub: "Fuel",
        amount: 5_000 + Math.round(rand() * 20) * 500, paidTo: vendors[3].name,
        vendorId: vendors[3].id, description: "Diesel for site vehicle", createdById: siteUser,
      });
      await add({
        date: dateIn(m), projectId: p.id, head: "Site Overheads", sub: pick(["Utilities", "Security", "Communication"]),
        amount: 8_000 + Math.round(rand() * 20) * 1_000, mode: pick<PaymentMode>(["CASH", "JAZZCASH", "EASYPAISA"]),
        paidTo: "Various", description: "Monthly site running cost", createdById: siteUser,
      });
    }
    // Head office overheads
    await add({
      date: `${m}-05`, projectId: headOffice.id, head: "Office Overheads", sub: "Rent",
      amount: 85_000, mode: "BANK_TRANSFER", paidTo: "Office landlord", description: "Office rent",
    });
    await add({
      date: `${m}-01`, projectId: headOffice.id, head: "Office Overheads", sub: "Admin salaries",
      amount: 240_000, mode: "BANK_TRANSFER", paidTo: "Office staff", description: "Admin staff salaries",
    });
  }

  // Labour payments (incl. advances)
  for (const m of months.slice(2)) {
    for (const w of workers.slice(0, 4)) {
      const days = 20 + Math.floor(rand() * 6);
      const projectId = w.defaultProjectId!;
      await add({
        date: dateIn(m), projectId, head: LABOUR_HEAD, sub: "Daily wages",
        amount: days * Number(w.rate), paidTo: w.name, workerId: w.id,
        description: `Wages: ${days} days × ${Number(w.rate)}`,
        createdById: projectId === p1.id ? site1.id : site2.id,
      });
    }
  }
  await add({
    date: "2026-09-12", projectId: p1.id, head: LABOUR_HEAD, sub: ADVANCE_SUBHEAD, amount: 10_000,
    paidTo: workers[0].name, workerId: workers[0].id, description: "Advance for family emergency",
  });
  await add({
    date: "2026-08-03", projectId: p1.id, head: LABOUR_HEAD, sub: "Contractor payments", amount: 350_000,
    mode: "CHEQUE", paidTo: vendors[2].name, vendorId: vendors[2].id, description: "Brickwork 2nd floor — running payment",
  });

  // Completed project history
  for (const [i, m] of ["2025-10", "2025-12", "2026-02", "2026-04"].entries()) {
    await add({
      date: `${m}-1${i}`, projectId: p4.id, head: "Materials", sub: pick(["Cement", "Steel", "Hardware"]),
      amount: 300_000 + i * 50_000, mode: "BANK_TRANSFER", paidTo: vendors[1].name, vendorId: vendors[1].id,
      description: "Warehouse structure materials",
    });
  }

  // Split bill (Flow 2): one fuel bill of 30,000 across two projects
  const splitGroupId = randomUUID();
  await add({
    date: "2026-10-02", projectId: p1.id, head: "Travelling", sub: "Fuel", amount: 18_000,
    paidTo: vendors[3].name, vendorId: vendors[3].id, description: "Monthly fuel bill (split)", splitGroupId,
  });
  await add({
    date: "2026-10-02", projectId: p2.id, head: "Travelling", sub: "Fuel", amount: 12_000,
    paidTo: vendors[3].name, vendorId: vendors[3].id, description: "Monthly fuel bill (split)", splitGroupId,
  });

  // Pending + rejected entries from site staff
  await add({
    date: "2026-10-10", projectId: p1.id, head: "Materials", sub: "Electrical", amount: 46_500,
    paidTo: vendors[4].name, vendorId: vendors[4].id, description: "Wiring and switches for 3rd floor",
    createdById: site1.id, status: "PENDING",
  });
  await add({
    date: "2026-10-11", projectId: p2.id, head: "Accommodation", sub: "Site camp rent", amount: 25_000,
    paidTo: "Camp owner", description: "Labour camp rent October", createdById: site2.id, status: "PENDING",
  });
  await add({
    date: "2026-10-12", projectId: p1.id, head: "TA/DA", sub: "Meal allowance", amount: 3_200,
    paidTo: "Site staff", description: "Meals during concrete pour", createdById: site1.id, status: "PENDING",
  });
  await add({
    date: "2026-10-08", projectId: p2.id, head: "Equipment & Machinery", sub: "Rental", amount: 60_000,
    paidTo: "Crane rental", description: "Crane hire 2 days", createdById: site2.id,
    status: "REJECTED", rejectionReason: "Rate not agreed — please attach quotation",
  });

  console.log(`Sample data: 4 projects, ${vendors.length} vendors, ${workers.length} workers, ${seq} expenses.`);
  console.log("Sample logins (password: password123): accountant, site1, site2");
}

async function main() {
  const admin = await seedReferenceData();
  console.log("Reference data ready. Admin login: admin / admin123 (must change on first login)");
  if (process.env.SEED_SAMPLE_DATA !== "false") await seedSampleData(admin.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

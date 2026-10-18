-- Employees & cash in hand (changes/changes.pdf §1: record of expenses by employees)
CREATE TYPE "EmployeeType" AS ENUM ('LABOUR', 'PERMANENT', 'PART_TIME');
CREATE TYPE "CashEntryType" AS ENUM ('OPENING', 'ISSUED', 'RETURNED');

ALTER TABLE "workers" ADD COLUMN "employee_type" "EmployeeType" NOT NULL DEFAULT 'LABOUR',
ADD COLUMN "designation" TEXT,
ADD COLUMN "user_id" INTEGER;
CREATE UNIQUE INDEX "workers_user_id_key" ON "workers"("user_id");
ALTER TABLE "workers" ADD CONSTRAINT "workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "paid_from_id" INTEGER;
CREATE INDEX "expenses_paid_from_id_idx" ON "expenses"("paid_from_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_from_id_fkey" FOREIGN KEY ("paid_from_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cash_entries" (
    "id" SERIAL NOT NULL,
    "entry_no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "worker_id" INTEGER NOT NULL,
    "type" "CashEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "project_id" INTEGER,
    "reference_no" TEXT,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cash_entries_entry_no_key" ON "cash_entries"("entry_no");
CREATE INDEX "cash_entries_worker_id_date_idx" ON "cash_entries"("worker_id", "date");
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

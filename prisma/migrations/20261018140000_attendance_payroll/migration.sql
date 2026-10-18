-- Office attendance and pay adjustments (changes/changes.pdf §3)
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE');
CREATE TYPE "PayAdjustmentType" AS ENUM ('BENEFIT', 'REWARD', 'INCENTIVE', 'DEDUCTION', 'ADVANCE_RECOVERY');

CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "worker_id" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "marked_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_worker_id_date_key" ON "attendance"("worker_id", "date");
CREATE INDEX "attendance_date_idx" ON "attendance"("date");
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pay_adjustments" (
    "id" SERIAL NOT NULL,
    "entry_no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "worker_id" INTEGER NOT NULL,
    "type" "PayAdjustmentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pay_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pay_adjustments_entry_no_key" ON "pay_adjustments"("entry_no");
CREATE INDEX "pay_adjustments_worker_id_date_idx" ON "pay_adjustments"("worker_id", "date");
ALTER TABLE "pay_adjustments" ADD CONSTRAINT "pay_adjustments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pay_adjustments" ADD CONSTRAINT "pay_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

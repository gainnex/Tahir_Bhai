-- Client bills (claimed / verified) and receipts (changes/changes.pdf §6, §7)
CREATE TYPE "ClientBillStatus" AS ENUM ('CLAIMED', 'VERIFIED');

CREATE TABLE "client_bills" (
    "id" SERIAL NOT NULL,
    "bill_no" TEXT NOT NULL,
    "project_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "client_ref" TEXT,
    "description" TEXT NOT NULL,
    "claimed_amount" DECIMAL(14,2) NOT NULL,
    "status" "ClientBillStatus" NOT NULL DEFAULT 'CLAIMED',
    "approved_amount" DECIMAL(14,2),
    "verified_date" DATE,
    "verification_note" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "client_bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_bills_bill_no_key" ON "client_bills"("bill_no");
CREATE INDEX "client_bills_project_id_date_idx" ON "client_bills"("project_id", "date");
ALTER TABLE "client_bills" ADD CONSTRAINT "client_bills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_bills" ADD CONSTRAINT "client_bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "client_receipts" (
    "id" SERIAL NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tax_deducted" DECIMAL(14,2),
    "payment_mode" "PaymentMode" NOT NULL,
    "reference_no" TEXT,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "client_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_receipts_receipt_no_key" ON "client_receipts"("receipt_no");
CREATE INDEX "client_receipts_bill_id_idx" ON "client_receipts"("bill_id");
CREATE INDEX "client_receipts_date_idx" ON "client_receipts"("date");
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "client_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

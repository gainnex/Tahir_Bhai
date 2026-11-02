-- Invoice details per project (changes/invoice.xlsx): client NTN / address and the work order
ALTER TABLE "projects" ADD COLUMN "client_ntn" TEXT;
ALTER TABLE "projects" ADD COLUMN "client_address" TEXT;
ALTER TABLE "projects" ADD COLUMN "work_order_no" TEXT;
ALTER TABLE "projects" ADD COLUMN "work_order_amount" DECIMAL(14,2);

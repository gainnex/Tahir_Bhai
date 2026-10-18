-- GST and withholding tax on expenses (changes/changes.pdf §4: "GST amount, Withholding Tax amount")
ALTER TABLE "expenses" ADD COLUMN "gst_amount" DECIMAL(14,2),
ADD COLUMN "wht_amount" DECIMAL(14,2);

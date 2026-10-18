-- Sub office cost centers (changes/changes.pdf §3: payroll "allocated to projects, sub office, head office")
ALTER TABLE "projects" ADD COLUMN "is_sub_office" BOOLEAN NOT NULL DEFAULT false;

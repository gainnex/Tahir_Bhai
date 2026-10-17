// Reference data from docs/FEATURES.md, shared by the seed script and the app.

export const HEAD_OFFICE_CODE = "HO-000";
export const HEAD_OFFICE_NAME = "Head Office / General";

export const LABOUR_HEAD = "Labour";
export const ADVANCE_SUBHEAD = "Advance to labour";

export const DEFAULT_HEADS: { name: string; subheads: string[] }[] = [
  { name: LABOUR_HEAD, subheads: ["Daily wages", "Contractor payments", "Overtime", ADVANCE_SUBHEAD] },
  {
    name: "Materials",
    subheads: ["Cement", "Steel", "Electrical", "Plumbing", "Hardware", "Material transport"],
  },
  { name: "Travelling", subheads: ["Fare", "Fuel", "Vehicle rent", "Toll"] },
  { name: "TA/DA", subheads: ["Daily allowance", "Local conveyance", "Meal allowance"] },
  { name: "Accommodation", subheads: ["Hotel", "Guest house", "Site camp rent"] },
  { name: "Equipment & Machinery", subheads: ["Rental", "Repair", "Machinery fuel"] },
  { name: "Site Overheads", subheads: ["Utilities", "Security", "Site office", "Communication"] },
  { name: "Office Overheads", subheads: ["Rent", "Utilities", "Admin salaries", "Stationery"] },
  { name: "Miscellaneous", subheads: ["Other"] },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: "My Construction Company",
  company_address: "",
  logo_path: "",
  auto_approve_privileged: "true",
  currency_label: "PKR",
};

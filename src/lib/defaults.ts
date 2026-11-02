// Reference data from docs/FEATURES.md, shared by the seed script and the app.

export const HEAD_OFFICE_CODE = "HO-000";
export const HEAD_OFFICE_NAME = "Head Office / General";

export const LABOUR_HEAD = "Workers";
export const ADVANCE_SUBHEAD = "Advance to labour";

export const DEFAULT_HEADS: { name: string; subheads: string[] }[] = [
  {
    name: LABOUR_HEAD,
    subheads: ["Daily wages", "Salaries", "Contractor payments", "Overtime", ADVANCE_SUBHEAD, "Balance payments"],
  },
  {
    name: "Material Purchasing",
    subheads: [
      "Cement",
      "Steel",
      "Electrical",
      "Plumbing",
      "Hardware",
      "Flooring",
      "Wooden material",
      "Ceiling",
      "Transport / carriage of material",
    ],
  },
  {
    name: "Travelling",
    subheads: ["Air / bus / train fare", "Van / taxi / rickshaw fare", "InDrive / Yango fare", "Fuel", "Vehicle rent", "Toll"],
  },
  { name: "TA/DA", subheads: ["Daily allowance", "Local conveyance", "Meal allowance", "Entertainment"] },
  { name: "Accommodation", subheads: ["Hotel", "Guest house", "Site camp rent"] },
  { name: "Tools, Van, Bike", subheads: ["Rental", "Maintenance", "Fuel"] },
  { name: "Site Overheads", subheads: ["Utilities", "Security", "Site office", "Communication"] },
  { name: "Office Overheads", subheads: ["Rent", "Utilities", "Admin salaries", "Stationery"] },
  { name: "Miscellaneous", subheads: ["Other"] },
];

/**
 * Heads / sub-heads renamed after the client's review (changes/changes.pdf). The seed applies
 * these to existing databases so entries keep their category instead of a duplicate head appearing.
 */
export const RENAMED_HEADS: { from: string; to: string; subheads?: Record<string, string> }[] = [
  { from: "Labour", to: LABOUR_HEAD },
  { from: "Materials", to: "Material Purchasing", subheads: { "Material transport": "Transport / carriage of material" } },
  { from: "Travelling", to: "Travelling", subheads: { Fare: "Air / bus / train fare" } },
  {
    from: "Equipment & Machinery",
    to: "Tools, Van, Bike",
    subheads: { Repair: "Maintenance", "Machinery fuel": "Fuel" },
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: "LINECRAFT",
  company_address: "",
  logo_path: "",
  auto_approve_privileged: "true",
  currency_label: "PKR",
  // Invoice (changes/invoice.xlsx)
  company_legal_name: "Line Craft (Pvt.) Ltd.",
  company_ntn: "2839032-6",
  sales_tax_label: "Sales Tax (PRA)",
  sales_tax_rate: "16",
  invoice_hs_code: "9824.0000- - - CONSTRUCTION SERVICES",
  bank_account_title: "Line Craft (Pvt.) Ltd.",
  bank_account_no: "0201139501820001",
  bank_iban: "PK89BKIP0201139501820001",
  bank_details: "BankIslami Pakistan Ltd.\nAkbar Chowk, Peco Road Branch Lahore\nBranch Code 2011",
  invoice_signatory: "KAMRAN NADEEM",
  invoice_signatory_title: "Accounts",
};

import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { amountInWords } from "@/lib/amount-words";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import type { AppSettings } from "@/server/services/settings-service";
import { loadLogo } from "./pdf";

// Printable client bill and payment receipt (changes/changes.pdf §6: "receipts generation"),
// on the company letterhead used by the report PDFs.

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.5, borderBottomColor: "#0f172a", paddingBottom: 10, marginBottom: 18 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "60%" },
  logo: { height: 44, maxWidth: 220, objectFit: "contain" },
  company: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  address: { fontSize: 9, color: "#475569", marginTop: 3 },
  docBox: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  docNo: { fontSize: 10, marginTop: 4, fontFamily: "Helvetica-Bold" },
  docDate: { fontSize: 9, color: "#475569", marginTop: 2 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  label: { width: "32%", color: "#475569" },
  value: { width: "68%" },
  bold: { fontFamily: "Helvetica-Bold" },
  amountBox: { marginTop: 18, borderWidth: 1, borderColor: "#0f172a", padding: 12 },
  amountLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  bigAmount: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  words: { marginTop: 8, fontSize: 9.5, fontFamily: "Helvetica-Oblique" },
  section: { marginTop: 16, fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 60 },
  sign: { width: "40%", borderTopWidth: 0.75, borderTopColor: "#0f172a", paddingTop: 4, textAlign: "center", fontSize: 9 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#94a3b8", textAlign: "center" },
});

type Line = [label: string, value: string | null | undefined, bold?: boolean];

async function Letterhead({ settings, title, number, date }: { settings: AppSettings; title: string; number: string; date: string }) {
  const logo = await loadLogo(settings);
  return (
    <View style={s.header}>
      <View style={s.brand}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {logo && <Image src={logo} style={s.logo} />}
        <View>
          <Text style={s.company}>{settings.companyName}</Text>
          {settings.companyAddress && <Text style={s.address}>{settings.companyAddress}</Text>}
        </View>
      </View>
      <View style={s.docBox}>
        <Text style={s.docTitle}>{title}</Text>
        <Text style={s.docNo}>{number}</Text>
        <Text style={s.docDate}>Date: {formatDate(date)}</Text>
      </View>
    </View>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  return (
    <View>
      {lines
        .filter(([, v]) => v)
        .map(([label, value, bold]) => (
          <View key={label} style={s.row} wrap={false}>
            <Text style={s.label}>{label}</Text>
            <Text style={[s.value, bold ? s.bold : {}]}>{value}</Text>
          </View>
        ))}
    </View>
  );
}

function render(title: string, body: React.ReactElement, settings: AppSettings) {
  return renderToBuffer(
    <Document title={title} author={settings.companyName} creator="Project Expense Manager">
      <Page size="A4" style={s.page}>
        {body}
        <Text style={s.footer} fixed>
          Generated {formatDateTime(new Date())} · {settings.companyName}
        </Text>
      </Page>
    </Document>,
  );
}

export type ReceiptDoc = {
  receiptNo: string;
  date: string;
  client: string;
  project: string;
  billNo: string;
  clientRef: string | null;
  amount: string;
  taxDeducted: string | null;
  paymentMode: string;
  referenceNo: string | null;
  notes: string | null;
  approved: string;
  creditedToDate: string;
  outstanding: string;
};

export async function receiptToPdf(r: ReceiptDoc, settings: AppSettings): Promise<Buffer> {
  const cur = settings.currencyLabel;
  const body = (
    <View>
      {await Letterhead({ settings, title: "PAYMENT RECEIPT", number: r.receiptNo, date: r.date })}
      <Lines
        lines={[
          ["Received from", r.client, true],
          ["Project", r.project],
          ["Against bill", [r.billNo, r.clientRef].filter(Boolean).join(" · ")],
          ["Payment mode", [r.paymentMode, r.referenceNo].filter(Boolean).join(" · ")],
          ["Notes", r.notes],
        ]}
      />
      <View style={s.amountBox} wrap={false}>
        <View style={s.amountLine}>
          <Text style={s.bold}>Amount received</Text>
          <Text style={s.bigAmount}>
            {cur} {formatAmount(r.amount)}
          </Text>
        </View>
        {r.taxDeducted && (
          <View style={s.amountLine}>
            <Text>Income tax deducted by client</Text>
            <Text>
              {cur} {formatAmount(r.taxDeducted)}
            </Text>
          </View>
        )}
        <Text style={s.words}>{amountInWords(r.amount)}</Text>
      </View>
      <Text style={s.section}>Bill position</Text>
      <Lines
        lines={[
          ["Verified bill amount", `${cur} ${formatAmount(r.approved)}`],
          ["Received to date (incl. tax deducted)", `${cur} ${formatAmount(r.creditedToDate)}`],
          ["Balance outstanding", `${cur} ${formatAmount(r.outstanding)}`, true],
        ]}
      />
      <View style={s.signatures}>
        <Text style={s.sign}>Received by</Text>
        <Text style={s.sign}>Authorised signature</Text>
      </View>
    </View>
  );
  return render(`Receipt ${r.receiptNo}`, body, settings);
}

export type BillDoc = {
  billNo: string;
  date: string;
  client: string;
  project: string;
  location: string | null;
  clientRef: string | null;
  description: string;
  claimed: string;
  contractValue: string | null;
  previousClaims: string;
};

export async function billToPdf(b: BillDoc, settings: AppSettings): Promise<Buffer> {
  const cur = settings.currencyLabel;
  const body = (
    <View>
      {await Letterhead({ settings, title: "RUNNING BILL", number: b.billNo, date: b.date })}
      <Lines
        lines={[
          ["To", b.client, true],
          ["Project", b.project],
          ["Location", b.location],
          ["Client reference", b.clientRef],
          ["Description", b.description],
        ]}
      />
      <View style={s.amountBox} wrap={false}>
        {b.contractValue && (
          <View style={s.amountLine}>
            <Text>Contract value</Text>
            <Text>
              {cur} {formatAmount(b.contractValue)}
            </Text>
          </View>
        )}
        <View style={s.amountLine}>
          <Text>Previous bills claimed</Text>
          <Text>
            {cur} {formatAmount(b.previousClaims)}
          </Text>
        </View>
        <View style={s.amountLine}>
          <Text style={s.bold}>Amount claimed in this bill</Text>
          <Text style={s.bigAmount}>
            {cur} {formatAmount(b.claimed)}
          </Text>
        </View>
        <Text style={s.words}>{amountInWords(b.claimed)}</Text>
      </View>
      <View style={s.signatures}>
        <Text style={s.sign}>Prepared by</Text>
        <Text style={s.sign}>Verified by (client)</Text>
      </View>
    </View>
  );
  return render(`Bill ${b.billNo}`, body, settings);
}

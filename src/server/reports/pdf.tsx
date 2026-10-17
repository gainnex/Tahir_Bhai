import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import type { CellValue, Report, ReportColumn, ReportTable } from "@/lib/reports";
import type { AppSettings } from "@/server/services/settings-service";
import { readUpload } from "@/server/storage";

// Report -> PDF with the company name, address and logo in the header (docs/FEATURES.md §9, §11).

// No automatic hyphenation ("Office Over-heads"); wrap on spaces only.
Font.registerHyphenationCallback((word) => [word]);

const NUMERIC: ReportColumn["type"][] = ["money", "int", "percent"];

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 8 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "55%" },
  logo: { height: 36, maxWidth: 90, objectFit: "contain" },
  company: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  address: { fontSize: 8, color: "#64748b", marginTop: 2 },
  titleBox: { alignItems: "flex-end", maxWidth: "45%" },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  subtitle: { fontSize: 7.5, color: "#475569", marginTop: 3, textAlign: "right" },
  tableTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  headRow: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 1, borderBottomColor: "#cbd5e1" },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#0f172a", backgroundColor: "#f8fafc" },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  headCell: { paddingVertical: 4, paddingHorizontal: 3, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#334155" },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  muted: { color: "#64748b", fontStyle: "italic", paddingVertical: 6 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#94a3b8" },
});

const WEIGHT: Record<ReportColumn["type"], number> = { text: 1.4, money: 1.2, date: 0.9, int: 0.6, percent: 0.6 };

function display(col: ReportColumn, v: CellValue): string {
  if (v === null || v === undefined || v === "") return "";
  if (col.type === "money") return formatAmount(String(v));
  if (col.type === "date") return formatDate(String(v));
  if (col.type === "percent") return `${v}%`;
  return String(v);
}

function TableBlock({ table }: { table: ReportTable }) {
  const weights = table.columns.map((c) => (c.wide ? 2.6 : WEIGHT[c.type]));
  const total = weights.reduce((a, b) => a + b, 0);
  const width = (i: number) => `${((weights[i] / total) * 100).toFixed(2)}%`;
  const align = (c: ReportColumn) => (NUMERIC.includes(c.type) ? s.right : undefined);

  return (
    <View>
      {table.title && <Text style={s.tableTitle}>{table.title}</Text>}
      <View style={s.headRow} fixed>
        {table.columns.map((c, i) => (
          <Text key={c.key} style={[s.headCell, { width: width(i) }, align(c) ?? {}]}>
            {c.label}
          </Text>
        ))}
      </View>
      {table.rows.length === 0 && <Text style={s.muted}>{table.empty ?? "No data."}</Text>}
      {table.rows.map((r, ri) => (
        <View key={ri} style={s.row} wrap={false}>
          {table.columns.map((c, i) => (
            <Text key={c.key} style={[s.cell, { width: width(i) }, align(c) ?? {}, r.emphasis ? s.bold : {}]}>
              {display(c, r.cells[c.key] ?? null)}
            </Text>
          ))}
        </View>
      ))}
      {table.totals && table.rows.length > 0 && (
        <View style={s.totalRow} wrap={false}>
          {table.columns.map((c, i) => (
            <Text key={c.key} style={[s.cell, s.bold, { width: width(i) }, align(c) ?? {}]}>
              {display(c, table.totals![c.key] ?? null)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

async function loadLogo(settings: AppSettings) {
  if (!settings.logoPath) return null;
  try {
    const data = Buffer.from(await readUpload(settings.logoPath));
    return { data, format: settings.logoPath.endsWith(".png") ? ("png" as const) : ("jpg" as const) };
  } catch {
    return null; // missing logo file must not break the report
  }
}

export async function reportToPdf(report: Report, settings: AppSettings): Promise<Buffer> {
  const logo = await loadLogo(settings);
  const generated = formatDateTime(new Date());
  const doc = (
    <Document title={report.title} author={settings.companyName} creator="Project Expense Manager">
      <Page size="A4" orientation={report.landscape ? "landscape" : "portrait"} style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {logo && <Image src={logo} style={s.logo} />}
            <View>
              <Text style={s.company}>{settings.companyName}</Text>
              {settings.companyAddress && <Text style={s.address}>{settings.companyAddress}</Text>}
            </View>
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>{report.title}</Text>
            <Text style={s.subtitle}>{report.subtitle}</Text>
          </View>
        </View>

        {report.message ? (
          <Text style={s.muted}>{report.message}</Text>
        ) : (
          report.tables.map((t, i) => <TableBlock key={i} table={t} />)
        )}

        <View style={s.footer} fixed>
          <Text>Generated {generated} · {settings.currencyLabel} amounts</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

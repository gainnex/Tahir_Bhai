import { Download, FileText } from "lucide-react";

type Att = { id: number; fileName: string; mimeType: string };

/** Receipt previews: image thumbnails / PDF tiles, each opening the file in a new tab. */
export function ReceiptThumbs({ attachments, size = "md" }: { attachments: Att[]; size?: "sm" | "md" }) {
  if (attachments.length === 0) return <p className="text-sm text-muted-foreground">No receipts attached.</p>;
  const box = size === "sm" ? "size-12" : "size-32";
  return (
    <div className="flex flex-wrap gap-3">
      {attachments.map((a) => (
        <div key={a.id} className={size === "sm" ? "" : "w-32"}>
          <a
            href={`/api/attachments/${a.id}`}
            target="_blank"
            rel="noopener"
            title={a.fileName}
            className={`flex ${box} items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted shadow-xs transition-shadow hover:ring-2 hover:ring-ring`}
          >
            {a.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route
              <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="size-full object-cover" loading="lazy" />
            ) : (
              <FileText className={size === "sm" ? "size-5 text-rose-600" : "size-10 text-rose-600"} />
            )}
          </a>
          {size === "md" && (
            <a
              href={`/api/attachments/${a.id}?download=1`}
              className="mt-1 flex items-center gap-1 truncate text-xs text-primary hover:underline"
              title={`Download ${a.fileName}`}
            >
              <Download className="size-3 shrink-0" /> <span className="truncate">{a.fileName}</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

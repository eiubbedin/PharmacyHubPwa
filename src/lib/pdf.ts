import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface PdfOrderLine {
  name: string;
  qty: number;
  concentratie: string;
  cantitateCutie: string;
  departament: string;
}

export interface PdfOrderData {
  id: number;
  nume: string;
  descriere: string | null;
  status: string | null;
  createdAt: string;
  totalMedicamente: number;
  totalCantitate: number | null;
  lines: PdfOrderLine[];
}

function normalizeDepartament(deptRaw: string): string {
  const d = (deptRaw || "").trim().toUpperCase();
  if (!d || d === "GENERAL") return "TABLETA";
  if (d.includes("IMPORT")) return "IMPORT";
  if (d.includes("TM")) return "TM";
  if (d.includes("TABLETA")) return "TABLETA";
  return d;
}

function extractBoxClean(boxRaw: string): string {
  const txt = String(boxRaw || "");
  const idx = txt.toLowerCase().indexOf("x");
  if (idx === -1 || idx + 1 >= txt.length) return "";
  let num = "";
  for (const ch of txt.slice(idx + 1)) {
    if (ch >= "0" && ch <= "9") num += ch;
    else break;
  }
  return num ? `x${num}` : "";
}

function sanitizeText(text: string): string {
  // Înlocuim diacriticele românești cu echivalente ASCII simple
  const map: Record<string, string> = {
    "ă": "a",
    "â": "a",
    "î": "i",
    "ș": "s",
    "ţ": "t",
    "ț": "t",
    "Ă": "A",
    "Â": "A",
    "Î": "I",
    "Ș": "S",
    "Ţ": "T",
    "Ț": "T",
  };

  return text
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
}

export async function generateOrderPdf(order: PdfOrderData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();

  const margin = 50;
  let y = height - margin;

  const fontTitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontText = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lineHeight = 14;

  const ensurePage = () => {
    page = pdfDoc.addPage();
    ({ width, height } = page.getSize());
    y = height - margin;
  };

  const drawText = (
    text: string,
    opts: { x?: number; y?: number; size?: number; bold?: boolean } = {}
  ) => {
    const size = opts.size ?? 12;
    const x = opts.x ?? margin;
    const font = opts.bold ? fontTitle : fontText;
    const safeText = sanitizeText(text);
    page.drawText(safeText, {
      x,
      y: opts.y ?? y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  };

  // Titlu
  drawText("COMANDĂ MEDICAMENTE F35", { x: margin, y, size: 16, bold: true });
  y -= lineHeight * 2;

  // Info comandă
  drawText(`Comandă: ${order.nume} (#${order.id})`, { size: 12, bold: true });
  y -= lineHeight;
  drawText(`Status: ${order.status ?? "-"}`);
  y -= lineHeight;
  drawText(`Creată la: ${order.createdAt}`);
  y -= lineHeight;
  drawText(
    `Total medicamente: ${order.totalMedicamente}  |  Total cantitate: ${
      order.totalCantitate ?? "-"
    }`
  );
  y -= lineHeight;
  if (order.descriere && order.descriere !== "EMPTY") {
    drawText(`Descriere: ${order.descriere}`);
    y -= lineHeight;
  }

  y -= lineHeight;
  drawText("LISTA MEDICAMENTE (format concentrat, 2 coloane)", { bold: true });
  y -= lineHeight;

  // Build entries list like Comenzi_Nou:
  // - group by department
  // - header lines like "=== DEPT ==="
  // - compact single-line items: "name conc, x20 - qty"
  const departments: Record<string, PdfOrderLine[]> = {};
  for (const l of order.lines) {
    const dept = normalizeDepartament(l.departament);
    (departments[dept] ??= []).push(l);
  }

  const deptKeys = Object.keys(departments).sort((a, b) =>
    a.localeCompare(b, "ro-RO", { sensitivity: "base" })
  );

  const entries: string[] = [];
  for (const dept of deptKeys) {
    const lines = departments[dept] ?? [];
    lines.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "ro-RO", {
        sensitivity: "base",
        numeric: true,
      })
    );

    entries.push(`=== ${dept} ===`);
    for (const line of lines) {
      const name = (line.name || "").trim();
      const conc = (line.concentratie || "").trim();
      const boxClean = extractBoxClean(line.cantitateCutie || "");

      let label = name;
      if (conc) label += ` ${conc}`;
      if (boxClean) label += `, ${boxClean}`;
      entries.push(`${label} - ${line.qty}`);
    }
  }

  const half = Math.ceil(entries.length / 2);
  const colLeft = entries.slice(0, half);
  const colRight = entries.slice(half);

  const gap = 18;
  const colWidth = (width - margin * 2 - gap) / 2;
  const leftX = margin;
  const rightX = margin + colWidth + gap;
  const rowStep = 11;
  const fontSize = 9;

  for (let i = 0; i < half; i += 1) {
    if (y < margin + rowStep * 2) {
      ensurePage();
    }

    const left = colLeft[i] ?? "";
    const right = colRight[i] ?? "";

    const leftIsHeader = left.startsWith("=== ") && left.endsWith(" ===");
    const rightIsHeader = right.startsWith("=== ") && right.endsWith(" ===");

    if (left) drawText(left, { x: leftX, y, size: fontSize, bold: leftIsHeader });
    if (right) drawText(right, { x: rightX, y, size: fontSize, bold: rightIsHeader });
    y -= rowStep;
  }

  return await pdfDoc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

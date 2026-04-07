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

function deptSortKey(dept: string): number {
  const d = (dept || "").toUpperCase();
  if (d === "IMPORT") return 0;
  if (d === "TABLETA") return 1;
  if (d === "TM") return 2;
  return 99;
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
  drawText("Linii comandă (pe departamente):", { bold: true });
  y -= lineHeight;

  const groups = new Map<string, PdfOrderLine[]>();
  for (const line of order.lines) {
    const dept = (line.departament || "NECUNOSCUT").toUpperCase();
    const arr = groups.get(dept) ?? [];
    arr.push(line);
    groups.set(dept, arr);
  }

  const departments = Array.from(groups.keys()).sort((a, b) => {
    const ka = deptSortKey(a);
    const kb = deptSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b, "ro-RO");
  });

  const gap = 18;
  const colWidth = (width - margin * 2 - gap) / 2;
  const itemStep = lineHeight * 1.55;

  const drawOrderLine = (x: number, yTop: number, line: PdfOrderLine) => {
    const title = `${line.name} x${line.qty}`;
    const info = `${line.concentratie} • ${line.cantitateCutie}`;
    drawText(title, { x, y: yTop, size: 11, bold: true });
    drawText(info, { x, y: yTop - lineHeight + 2, size: 9 });
  };

  for (const dept of departments) {
    const lines = (groups.get(dept) ?? []).slice();
    lines.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "ro-RO", {
        sensitivity: "base",
        numeric: true,
      })
    );

    let idx = 0;
    while (idx < lines.length) {
      // Need room for header + at least one item.
      if (y < margin + lineHeight * 3) {
        ensurePage();
      }

      drawText(dept, { x: margin, y, size: 13, bold: true });
      y -= lineHeight * 1.25;

      const leftX = margin;
      const rightX = margin + colWidth + gap;
      let leftY = y;
      let rightY = y;

      while (idx < lines.length) {
        const canLeft = leftY >= margin + itemStep;
        const canRight = rightY >= margin + itemStep;

        if (!canLeft && !canRight) {
          break;
        }

        if (canLeft) {
          drawOrderLine(leftX, leftY, lines[idx]);
          leftY -= itemStep;
          idx += 1;
          continue;
        }

        if (canRight) {
          drawOrderLine(rightX, rightY, lines[idx]);
          rightY -= itemStep;
          idx += 1;
          continue;
        }
      }

      y = Math.min(leftY, rightY) - lineHeight;
      if (idx < lines.length) {
        ensurePage();
      }
    }

    y -= lineHeight * 0.5;
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

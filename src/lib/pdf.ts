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
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const margin = 50;
  let y = height - margin;

  const fontTitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontText = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lineHeight = 14;

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
  drawText("Linii comandă:", { bold: true });
  y -= lineHeight;

  // Linii: fiecare medicament pe două rânduri (similar cu UI-ul din aplicație)
  for (const line of order.lines) {
    if (y < margin + lineHeight * 3) {
      // nouă pagină simplă
      y = height - margin;
    }

    const title = `${line.name} x${line.qty}`;
    const info = `${line.concentratie} • ${line.cantitateCutie} • ${line.departament}`;

    drawText(title, { x: margin, bold: true });
    y -= lineHeight;
    drawText(info, { x: margin, size: 10 });
    y -= lineHeight * 1.5;
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

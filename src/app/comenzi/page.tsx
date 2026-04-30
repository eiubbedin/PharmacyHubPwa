"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import jsPDF from "jspdf";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

interface OrderSession {
  id: number;
  nume_comanda: string | null;
  descriere: string | null;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
}

interface OrderLine {
  id: number;
  qty: number;
  denumire: string;
  concentratie: string;
  cantitate_cutie: string;
  departament: string;
  med_type: string;
}

function normalizeDept(raw: string): string {
  const d = (raw ?? "").trim().toUpperCase();
  if (!d || d === "GENERAL") return "TABLETA";
  if (d.includes("IMPORT")) return "IMPORT";
  if (d.includes("TM")) return "TM";
  if (d.includes("TABLETA")) return "TABLETA";
  return d;
}

function boxClean(box: string): string {
  const lower = (box ?? "").toLowerCase();
  const idx = lower.indexOf("x");
  if (idx === -1) return "";
  const after = lower.slice(idx + 1);
  const digits = after.match(/^\d+/)?.[0] ?? "";
  return digits ? `x${digits}` : "";
}

async function generatePdf(session: OrderSession): Promise<void> {
  const { data: rawLines, error: linesError } = await supabase
    .from("orders")
    .select("id, cantitate_comandata, medicament_id")
    .eq("order_session_id", session.id);

  if (linesError || !rawLines || rawLines.length === 0) {
    alert("Nu s-au putut încărca liniile comenzii.");
    return;
  }

  const medIds = (rawLines as any[]).map((r) => r.medicament_id);
  const { data: medsData, error: medsError } = await supabase
    .from("medicines")
    .select("id, denumire, concentratie, cantitate_cutie, departament, med_type")
    .in("id", medIds);

  if (medsError) {
    alert("Nu s-au putut încărca datele medicamentelor.");
    return;
  }

  const medsMap: Record<number, any> = {};
  for (const m of (medsData ?? []) as any[]) {
    medsMap[m.id] = m;
  }

  const lines: OrderLine[] = (rawLines as any[]).map((r) => {
    const med = medsMap[r.medicament_id] ?? {};
    return {
      id: r.id,
      qty: r.cantitate_comandata ?? 1,
      denumire: med.denumire ?? "",
      concentratie: med.concentratie ?? "",
      cantitate_cutie: med.cantitate_cutie ?? "",
      departament: med.departament ?? "",
      med_type: med.med_type ?? "",
    };
  });

  if (lines.length === 0) {
    alert("Comanda nu are produse de exportat.");
    return;
  }

  // Group by dept
  const deptMap: Record<string, OrderLine[]> = {};
  for (const l of lines) {
    const dept = normalizeDept(l.departament);
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(l);
  }
  const entries: string[] = [];
  for (const dept of Object.keys(deptMap).sort()) {
    const sorted = deptMap[dept].sort((a, b) =>
      a.denumire.toLowerCase().localeCompare(b.denumire.toLowerCase())
    );
    entries.push(`=== ${dept} ===`);
    for (const o of sorted) {
      let label = o.denumire.trim();
      if (o.concentratie.trim()) label += ` ${o.concentratie.trim()}`;
      const bc = boxClean(o.cantitate_cutie);
      if (bc) label += `, ${bc}`;
      entries.push(`${label} - ${o.qty}`);
    }
  }

  const title = session.nume_comanda || `Comanda #${session.id}`;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const maxW = pageW - margin * 2;
  const maxY = pageH - margin;

  const DARK_BLUE: [number, number, number] = [0, 51, 153];
  const DARK_GREEN: [number, number, number] = [0, 115, 51];
  const LIGHT_GREY: [number, number, number] = [230, 230, 230];
  const ROW_GREY: [number, number, number] = [240, 240, 240];
  const HEADER_GREY: [number, number, number] = [140, 140, 140];

  let y = margin;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...DARK_BLUE);
  doc.text("COMANDĂ MEDICAMENTE F35", pageW / 2, y, { align: "center" });
  y += 30;

  // Info table
  const created = new Date(session.created_at);
  const dateLabel = created.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  const infoRows: [string, string][] = [
    ["Nume comandă:", title],
    ...(session.descriere && session.descriere !== "EMPTY" ? [["Descriere:", session.descriere] as [string, string]] : []),
    ["Status:", session.status ?? "-"],
    ["Data creare:", dateLabel],
    ["Total medicamente:", String(session.total_medicamente ?? lines.length)],
    ["Total cantitate:", String(session.total_cantitate ?? lines.reduce((s, l) => s + l.qty, 0))],
  ];

  const infoLeftW = 120;
  const infoRightW = maxW - infoLeftW;
  const infoPad = 6;
  const infoCellH = 22;

  for (const [label, value] of infoRows) {
    doc.setFillColor(...LIGHT_GREY);
    doc.rect(margin, y, infoLeftW, infoCellH, "F");
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, infoLeftW, infoCellH, "S");
    doc.rect(margin + infoLeftW, y, infoRightW, infoCellH, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(label, margin + infoPad, y + infoCellH / 2 + 3);

    doc.setFont("helvetica", "normal");
    doc.text(value, margin + infoLeftW + infoPad, y + infoCellH / 2 + 3);
    y += infoCellH;
  }

  y += 20;

  // Section header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK_GREEN);
  doc.text("LISTA MEDICAMENTE (format concentrat, 2 coloane)", margin, y + 14);
  y += 24;

  // 2-column table
  const colW = maxW / 2;
  const pad = 6;
  const headerH = 22;
  const cellFontSize = 9;

  function drawMedsHeader(yPos: number) {
    doc.setFillColor(...HEADER_GREY);
    doc.rect(margin, yPos, colW, headerH, "F");
    doc.rect(margin + colW, yPos, colW, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(cellFontSize);
    doc.setTextColor(255, 255, 255);
    doc.text("Medicamente", margin + pad, yPos + headerH / 2 + 3);
    doc.text("Medicamente", margin + colW + pad, yPos + headerH / 2 + 3);
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, colW, headerH, "S");
    doc.rect(margin + colW, yPos, colW, headerH, "S");
  }

  function drawFooter() {
    const now = new Date().toLocaleString("ro-RO");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Generat: ${now} | Aplicația F35 - Comenzi Medicamente`,
      pageW / 2,
      pageH - margin + 14,
      { align: "center" }
    );
  }

  if (y + headerH > maxY - 40) { drawFooter(); doc.addPage(); y = margin; }
  drawMedsHeader(y);
  y += headerH;

  const half = Math.ceil(entries.length / 2);
  const leftCol = entries.slice(0, half);
  const rightCol = entries.slice(half);
  const rowCount = Math.max(leftCol.length, rightCol.length);

  for (let i = 0; i < rowCount; i++) {
    const leftText = i < leftCol.length ? leftCol[i] : "";
    const rightText = i < rightCol.length ? rightCol[i] : "";
    const rowH = 18;

    if (y + rowH > maxY - 40) {
      drawFooter();
      doc.addPage();
      y = margin;
      drawMedsHeader(y);
      y += headerH;
    }

    const bg: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : ROW_GREY;
    doc.setFillColor(...bg);
    doc.rect(margin, y, colW, rowH, "F");
    doc.rect(margin + colW, y, colW, rowH, "F");

    const isLeftHeader = leftText.startsWith("=== ");
    const isRightHeader = rightText.startsWith("=== ");

    doc.setFont("helvetica", isLeftHeader ? "bold" : "normal");
    doc.setFontSize(cellFontSize);
    doc.setTextColor(0, 0, 0);
    if (leftText) doc.text(leftText, margin + pad, y + rowH / 2 + 3, { maxWidth: colW - pad * 2 });

    doc.setFont("helvetica", isRightHeader ? "bold" : "normal");
    if (rightText) doc.text(rightText, margin + colW + pad, y + rowH / 2 + 3, { maxWidth: colW - pad * 2 });

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, colW, rowH, "S");
    doc.rect(margin + colW, y, colW, rowH, "S");

    y += rowH;
  }

  drawFooter();

  const safeTitle = title.replace(/[/:\\]/g, "-");
  doc.save(`${safeTitle}.pdf`);
}

export default function ComenziPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderSession[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVA" | "FINALIZATA">("ALL");

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("role, department")
          .eq("user_id", userData.user.id)
          .limit(1);
        setProfile(((p as Profile[] | null) ?? [])[0] ?? null);
      } else {
        setProfile(null);
      }

      const { data, error } = await supabase
        .from("order_sessions")
        .select(
          "id, nume_comanda, descriere, status, created_at, total_medicamente, total_cantitate"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Eroare la încărcarea istoricului de comenzi", error);
        setError("Nu s-au putut încărca comenzile.");
        setLoading(false);
        return;
      }

      setItems((data as OrderSession[]) ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  const isDepartment = profile?.role === "department";
  const isPharmacistStaff = profile?.role === "pharmacist_staff";

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((s) => {
      const matchSearch = !q || (s.nume_comanda ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [items, search, statusFilter]);

  async function handleDeleteSession(session: OrderSession, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isPharmacistStaff) {
      alert("Acest cont nu are dreptul de a șterge comenzi din istoric.");
      return;
    }

    if (session.status === "ACTIVA") {
      alert("Nu poți șterge o comandă activă. Finalizeaz-o mai întâi.");
      return;
    }

    if (
      !confirm(
        `Sigur vrei să ștergi definitiv comanda "${
          session.nume_comanda || `Comandă #${session.id}`
        }" și toate liniile ei?`
      )
    ) {
      return;
    }

    // Ștergem întâi liniile de comandă, apoi sesiunea
    const { error: ordersError } = await supabase
      .from("orders")
      .delete()
      .eq("order_session_id", session.id);

    if (ordersError) {
      console.error("Eroare la ștergerea liniilor comenzii", ordersError);
      alert("Nu s-au putut șterge liniile comenzii.");
      return;
    }

    const { error: sessionError } = await supabase
      .from("order_sessions")
      .delete()
      .eq("id", session.id);

    if (sessionError) {
      console.error("Eroare la ștergerea comenzii", sessionError);
      alert("Nu s-a putut șterge comanda.");
      return;
    }

    setItems((prev) => prev.filter((s) => s.id !== session.id));
  }

  async function handleExportPdf(session: OrderSession, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExportingId(session.id);
    try {
      await generatePdf(session);
    } finally {
      setExportingId(null);
    }
  }

  async function handleRenameSession(session: OrderSession, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isPharmacistStaff) {
      alert("Acest cont nu are dreptul de a redenumi comenzi.");
      return;
    }

    const newName = prompt(
      `Redenumește comanda "${session.nume_comanda || `Comandă #${session.id}`}"`,
      session.nume_comanda || ""
    );

    if (!newName || newName.trim() === "") return;
    if (newName.trim() === session.nume_comanda) return;

    try {
      const { error } = await supabase
        .from("order_sessions")
        .update({ nume_comanda: newName.trim() })
        .eq("id", session.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((s) =>
          s.id === session.id ? { ...s, nume_comanda: newName.trim() } : s
        )
      );
    } catch (error) {
      console.error("Eroare la redenumirea comenzii", error);
      alert("Nu s-a putut redenumi comanda.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">
        Se încarcă istoricul de comenzi...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-16 sm:pb-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Caută după nume comandă..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Filtre status */}
      <div className="flex gap-2">
        {(["ALL", "ACTIVA", "FINALIZATA"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f === "ALL" ? `Toate (${items.length})` : f === "ACTIVA" ? `Active (${items.filter(s => s.status === "ACTIVA").length})` : `Finalizate (${items.filter(s => s.status === "FINALIZATA").length})`}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {filteredItems.map((s, idx) => {
          const created = new Date(s.created_at);
          const dateLabel = created.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
          const isActive = s.status === "ACTIVA";
          const isFinalized = s.status === "FINALIZATA";

          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < filteredItems.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <Link href={`/comenzi/${s.id}`} className="min-w-0 flex-1 block">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${isActive ? "text-green-600" : "text-gray-900"}`}>
                    {s.nume_comanda || `Comandă #${s.id}`}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isActive ? "bg-green-100 text-green-700" :
                    isFinalized ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {s.status || "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {dateLabel} · {s.total_medicamente ?? 0} med. · {s.total_cantitate ?? "-"} buc.
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={exportingId === s.id}
                  onClick={(e) => handleExportPdf(s, e)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  {exportingId === s.id ? (
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  PDF
                </button>
                {!isDepartment && !isPharmacistStaff && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => handleRenameSession(s, e)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                      title="Redenumește"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(s, e)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Șterge"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && !error && (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            {items.length === 0 ? "Nu există comenzi înregistrate încă." : "Nicio comandă găsită."}
          </div>
        )}
      </div>
    </div>
  );
}

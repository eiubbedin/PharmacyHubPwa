"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { generateOrderPdf, downloadPdf } from "@/lib/pdf";

type LineStatus = "pending" | "in_stock" | "out_of_stock" | "sent";

function statusLabel(s: LineStatus) {
  if (s === "in_stock") return "În stoc";
  if (s === "out_of_stock") return "Nu e în stoc";
  if (s === "sent") return "Trimis";
  return "În așteptare";
}

function statusPillClass(s: LineStatus) {
  if (s === "in_stock") return "bg-emerald-100 text-emerald-800";
  if (s === "out_of_stock") return "bg-red-100 text-red-800";
  if (s === "sent") return "bg-blue-100 text-blue-800";
  return "bg-zinc-100 text-zinc-700";
}

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
  medicament_id: number;
  cantitate_comandata: number;
  created_at: string;
  // Tipul exact întors de Supabase pentru `medicines` poate varia (obiect sau array),
  // așa că îl tratăm ca `any` și îl folosim defensiv în cod.
  medicines?: any;
}

export const runtime = "edge";

export default function ComandaDetaliiPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [statusByOrderId, setStatusByOrderId] = useState<Record<number, LineStatus>>({});

  useEffect(() => {
    async function load() {
      const id = Number(params.id);
      if (!Number.isFinite(id)) {
        setError("ID de comandă invalid.");
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: sessions, error: sErr } = await supabase
        .from("order_sessions")
        .select(
          "id, nume_comanda, descriere, status, created_at, total_medicamente, total_cantitate"
        )
        .eq("id", id)
        .limit(1);

      if (sErr) {
        console.error("Eroare la încărcarea sesiunii", sErr);
        setError("Nu s-au putut încărca detaliile comenzii.");
        setLoading(false);
        return;
      }

      const ses = (sessions as OrderSession[] | null)?.[0] ?? null;
      if (!ses) {
        setError("Comanda nu a fost găsită.");
        setLoading(false);
        return;
      }

      setSession(ses);

      const { data: orderLines, error: lErr } = await supabase
        .from("orders")
        .select(
          "id, medicament_id, cantitate_comandata, created_at, medicines(denumire, concentratie, cantitate_cutie, departament)"
        )
        .eq("order_session_id", id);

      if (lErr) {
        console.error("Eroare la încărcarea liniilor", lErr);
        setError("Nu s-au putut încărca liniile comenzii.");
        setLoading(false);
        return;
      }

      const raw: OrderLine[] = ((orderLines ?? []) as OrderLine[]);

      raw.sort((a, b) => {
        const depA = (a.medicines?.departament || "").toUpperCase();
        const depB = (b.medicines?.departament || "").toUpperCase();
        if (depA !== depB) return depA.localeCompare(depB, "ro-RO");

        const denA = (a.medicines?.denumire || "").toUpperCase();
        const denB = (b.medicines?.denumire || "").toUpperCase();
        return denA.localeCompare(denB, "ro-RO");
      });

      setLines(raw);

      if (raw.length > 0) {
        const ids = raw.map((l) => l.id);
        const { data: statuses, error: statusErr } = await supabase
          .from("order_line_status")
          .select("order_id, status")
          .in("order_id", ids);

        if (statusErr) {
          console.error("Eroare la încărcarea statusurilor", statusErr);
          setStatusByOrderId({});
        } else {
          const map: Record<number, LineStatus> = {};
          for (const row of ((statuses ?? []) as { order_id: number; status: LineStatus }[])) {
            map[row.order_id] = row.status;
          }
          setStatusByOrderId(map);
        }
      } else {
        setStatusByOrderId({});
      }
      setLoading(false);
    }

    load();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă detaliile comenzii...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 pb-16 sm:pb-6">
        <header className="border-b border-zinc-200 pb-3">
          <div className="flex items-center justify-between gap-2">
            <Link href="/comenzi" className="text-xs text-blue-600">
              ‹ Înapoi la istoric
            </Link>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Detalii comandă
            </h2>
          </div>
        </header>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const created = new Date(session.created_at);
  const dateLabel = created.toLocaleString("ro-RO", {
    dateStyle: "short",
    timeStyle: "short",
  });

  async function handleExportPdf() {
    if (!session) return;

    const orderData = {
      id: session.id!,
      nume: session.nume_comanda || `Comandă #${session.id}`,
      descriere: session.descriere,
      status: session.status,
      createdAt: dateLabel,
      totalMedicamente: session.total_medicamente ?? lines.length,
      totalCantitate: session.total_cantitate,
      lines: lines.map((l) => ({
        name: l.medicines?.denumire || "-",
        qty: l.cantitate_comandata,
        concentratie: l.medicines?.concentratie || "-",
        cantitateCutie: l.medicines?.cantitate_cutie || "-",
        departament: l.medicines?.departament || "-",
      })),
    };

    const bytes = await generateOrderPdf(orderData);
    downloadPdf(bytes, `Comanda_F35_${session.id}.pdf`);
  }

  async function handleExportText() {
    if (!session) return;

    let textContent = `COMANDĂ MEDICAMENTE F35\n`;
    textContent += `=====================================\n\n`;
    textContent += `Nume comandă: ${session.nume_comanda || `Comandă #${session.id}`}\n`;
    textContent += `Status: ${session.status}\n`;
    textContent += `Data creare: ${dateLabel}\n`;
    textContent += `Total medicamente: ${session.total_medicamente ?? lines.length}\n`;
    textContent += `Total cantitate: ${session.total_cantitate || 0}\n`;
    
    if (session.descriere) {
      textContent += `Descriere: ${session.descriere}\n`;
    }
    
    textContent += `\nMEDICAMENTE:\n`;
    textContent += `-------------------------------------\n`;
    
    lines.forEach((line, index) => {
      const med = line.medicines;
      textContent += `${index + 1}. ${med?.denumire || '-'}\n`;
      textContent += `   Concentrație: ${med?.concentratie || '-'}\n`;
      textContent += `   Cantitate/cutie: ${med?.cantitate_cutie || '-'}\n`;
      textContent += `   Departament: ${med?.departament || '-'}\n`;
      textContent += `   Cantitate comandată: ${line.cantitate_comandata}\n`;
      textContent += '\n';
    });

    // Creează fișier text și descarcă
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Comanda_F35_${session.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleExportCSV() {
    if (!session) return;

    let csvContent = '\ufeff'; // BOM pentru UTF-8
    csvContent += 'Nume medicament,Concentratie,Cantitate/cutie,Departament,Cantitate comandata\n';
    
    lines.forEach((line) => {
      const med = line.medicines;
      const row = [
        `"${med?.denumire || '-'}"`,
        `"${med?.concentratie || '-'}"`,
        `"${med?.cantitate_cutie || '-'}"`,
        `"${med?.departament || '-'}"`,
        line.cantitate_comandata
      ].join(',');
      csvContent += row + '\n';
    });

    // Creează fișier CSV și descarcă
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Comanda_F35_${session.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopyToClipboard() {
    if (!session) return;

    let textContent = `COMANDĂ: ${session.nume_comanda || `Comandă #${session.id}`}\n`;
    textContent += `Data: ${dateLabel}\n`;
    textContent += `Total: ${session.total_medicamente ?? lines.length} medicamente, ${session.total_cantitate || 0} buc\n\n`;
    
    lines.forEach((line, index) => {
      const med = line.medicines;
      textContent += `${index + 1}. ${med?.denumire || '-'} ${med?.concentratie || ''} ${med?.cantitate_cutie || ''} - ${line.cantitate_comandata} buc\n`;
    });

    try {
      await navigator.clipboard.writeText(textContent);
      alert('Comandă copiată în clipboard!');
    } catch (err) {
      console.error('Eroare la copiere în clipboard:', err);
      alert('Nu s-a putut copia în clipboard.');
    }
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      <header className="border-b border-zinc-200 pb-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/comenzi" className="text-xs text-blue-600">
            ‹ Înapoi la istoric
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
            >
              📄 PDF
            </button>
            <button
              type="button"
              onClick={handleExportText}
              className="rounded-full border border-green-600 px-3 py-1 text-xs font-medium text-green-700 shadow-sm hover:bg-green-50"
            >
              📝 Text
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="rounded-full border border-purple-600 px-3 py-1 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50"
            >
              📊 CSV
            </button>
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="rounded-full border border-orange-600 px-3 py-1 text-xs font-medium text-orange-700 shadow-sm hover:bg-orange-50"
            >
              📋 Clipboard
            </button>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              {session.nume_comanda || `Comandă #${session.id}`}
            </h3>
            <p className="text-xs text-zinc-600">{dateLabel}</p>
            {session.descriere && session.descriere !== "EMPTY" && (
              <p className="mt-1 text-xs text-zinc-600">
                {session.descriere}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-zinc-600">
            <p>
              Status: <span className="font-medium">{session.status}</span>
            </p>
            <p>
              Total medicamente: {session.total_medicamente ?? lines.length}
            </p>
            <p>
              Total cantitate: {session.total_cantitate ?? "-"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 text-sm">
            <h4 className="font-medium text-zinc-700">Linii de comandă</h4>
            <span className="text-xs text-zinc-500">
              {lines.length} poziții
            </span>
          </div>

          <div className="max-h-[60vh] overflow-auto">
            {lines.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                Nu există linii pentru această comandă.
              </div>
            )}

            {lines.length > 0 && (
              <div className="divide-y divide-zinc-100 text-sm">
                {(() => {
                  const groups: { dep: string; items: typeof lines }[] = [];
                  for (const line of lines) {
                    const dep = (line.medicines?.departament || "-").toUpperCase();
                    const last = groups[groups.length - 1];
                    if (!last || last.dep !== dep) {
                      groups.push({ dep, items: [line] });
                    } else {
                      last.items.push(line);
                    }
                  }

                  return groups.map((g) => (
                    <div key={g.dep}>
                      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700">
                        {g.dep}
                      </div>
                      <ul className="divide-y divide-zinc-100">
                        {g.items.map((line) => {
                          const med = line.medicines;
                          const name = med?.denumire || "-";
                          const qty = line.cantitate_comandata;
                          const concentratie = med?.concentratie || "-";
                          const cantCutie = med?.cantitate_cutie || "-";
                          const departament = med?.departament || "-";
                          const st = statusByOrderId[line.id] || "pending";

                          return (
                            <li key={line.id} className="px-4 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-medium text-zinc-900">
                                      {name} x{qty}
                                    </p>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClass(
                                        st
                                      )}`}
                                    >
                                      {statusLabel(st)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-zinc-600">
                                    {concentratie} • {cantCutie} • {departament}
                                  </p>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

type OrderSession = {
  id: number;
  nume_comanda: string | null;
  descriere: string | null;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
};

type OrderLine = {
  id: number;
  medicament_id: number;
  cantitate_comandata: number;
  created_at: string;
  // Tipul real întors de Supabase pentru `medicines` poate varia (obiect sau array),
  // așa că îl tratăm ca `any` și îl folosim defensiv în cod.
  medicines?: any;
};

export default function ComandaActivaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [statusByOrderId, setStatusByOrderId] = useState<Record<number, LineStatus>>({});
  const [saving, setSaving] = useState(false);
  const [lineActionsOpen, setLineActionsOpen] = useState(false);
  const [lineActionsLine, setLineActionsLine] = useState<OrderLine | null>(null);
  const [role, setRole] = useState<"pharmacist_admin" | "pharmacist_staff" | "department" | null>(null);

  async function createOrderSession(params: {
    nume_comanda: string;
    descriere: string;
    status: "ACTIVA" | "FINALIZATA";
  }): Promise<{ ok: true } | { ok: false; error: any }> {
    const { nume_comanda, descriere, status } = params;
    const { error: insertError } = await supabase.from("order_sessions").insert({
      nume_comanda,
      descriere,
      status,
    });

    if (!insertError) {
      return { ok: true };
    }

    const code = typeof (insertError as any).code === "string" ? (insertError as any).code : "";
    // 23505 = unique violation (PK sequence out of sync)
    // 23502 = not_null_violation (id has NOT NULL constraint without identity/sequence)
    if (code !== "23505" && code !== "23502") {
      return { ok: false, error: insertError };
    }

    // Fallback: compute next id manually and retry.
    const { data: lastRow, error: lastErr } = await supabase
      .from("order_sessions")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (lastErr) {
      return { ok: false, error: insertError };
    }

    const lastId = ((lastRow as { id: number }[] | null) ?? [])[0]?.id ?? 0;
    const nextId = lastId + 1;

    const { error: retryError } = await supabase.from("order_sessions").insert({
      id: nextId,
      nume_comanda,
      descriere,
      status,
    } as any);

    if (retryError) {
      return { ok: false, error: retryError };
    }

    return { ok: true };
  }

  async function loadData() {
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
        .select("role")
        .eq("user_id", userData.user.id)
        .limit(1);
      const role = ((p as { role: string }[] | null) ?? [])[0]?.role;
      setRole((role as any) ?? null);
      if (role === "department") {
        router.replace("/dept");
        return;
      }
    }

    const { data: activeSessions, error: sessionError } = await supabase
      .from("order_sessions")
      .select(
        "id, nume_comanda, descriere, status, created_at, total_medicamente, total_cantitate"
      )
      .eq("status", "ACTIVA")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionError) {
      console.error("Eroare la încărcarea comenzii active", sessionError);
      setError("Nu s-a putut încărca comanda activă.");
      setLoading(false);
      return;
    }

    const active = (activeSessions as OrderSession[] | null)?.[0] ?? null;
    setSession(active);

    if (!active) {
      setLines([]);
      setStatusByOrderId({});
      setLoading(false);
      return;
    }

    const { data: orderLines, error: linesError } = await supabase
      .from("orders")
      .select(
        "id, medicament_id, cantitate_comandata, created_at, medicines(denumire, concentratie, cantitate_cutie, departament)"
      )
      .eq("order_session_id", active.id);

    if (linesError) {
      console.error("Eroare la încărcarea liniilor de comandă", linesError);
      setError("Nu s-au putut încărca liniile comenzii.");
      setLoading(false);
      return;
    }

    const rawLines: OrderLine[] = ((orderLines ?? []) as OrderLine[]);

    rawLines.sort((a, b) => {
      const depA = (a.medicines?.departament || "").toUpperCase();
      const depB = (b.medicines?.departament || "").toUpperCase();
      if (depA !== depB) return depA.localeCompare(depB, "ro-RO");

      const denA = (a.medicines?.denumire || "").toUpperCase();
      const denB = (b.medicines?.denumire || "").toUpperCase();
      return denA.localeCompare(denB, "ro-RO");
    });

    setLines(rawLines);

    if (rawLines.length > 0) {
      const ids = rawLines.map((l) => l.id);
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

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      await loadData();
    }

    load();

    // Realtime subscription
    const channel = supabase
      .channel("order_sessions_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_sessions" },
        () => {
          // Refresh la orice schimbare în sesiuni
          void loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          // Refresh la orice schimbare în linii
          void loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_line_status" },
        () => {
          // Refresh la statusuri
          void loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    if (!lineActionsOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        setLineActionsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lineActionsOpen, saving]);

  async function handleCreateNewOrder() {
    if (role === "pharmacist_staff") {
      alert("Acest cont nu are dreptul de a crea o comandă nouă.");
      return;
    }
    const nume = prompt("Nume comandă nouă:", "Comandă nouă");
    if (!nume) return;

    setSaving(true);
    setError(null);

    try {
      await supabase
        .from("order_sessions")
        .update({ status: "FINALIZATA" })
        .eq("status", "ACTIVA");

      const created = await createOrderSession({
        nume_comanda: nume,
        descriere: "",
        status: "ACTIVA",
      });

      if (!created.ok) throw created.error;
      await loadData();
    } catch (e) {
      console.error("Eroare la crearea comenzii noi", e);
      setError("Nu s-a putut crea comanda nouă.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizeOrder() {
    if (role === "pharmacist_staff") {
      alert("Acest cont nu are dreptul de a finaliza comanda.");
      return;
    }
    if (!session) return;
    if (!confirm(`Sigur vrei să finalizezi comanda "${session.nume_comanda}"?`)) return;

    setSaving(true);
    setError(null);
    try {
      // 1) Finalizează comanda curentă
      const { error: finalizeError } = await supabase
        .from("order_sessions")
        .update({ status: "FINALIZATA" })
        .eq("id", session.id);

      if (finalizeError) throw finalizeError;

      // Trimite push notification la userii de depozit
      void fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Comandă nouă de preluat",
          body: `${session.nume_comanda || `Comanda #${session.id}`} a fost finalizată și este gata de ridicare.`,
          url: "/depozit",
          targetRole: "department",
        }),
      });

      // 2) Încearcă să creeze automat o nouă comandă activă
      // Dacă acest pas eșuează, comanda rămâne totuși finalizată (și UI trebuie să reflecte asta).
      const today = new Date().toLocaleDateString("ro-RO", {
        day: "2-digit",
        month: "long",
      });
      const newOrderName = `Comanda ${today}`;

      const created = await createOrderSession({
        nume_comanda: newOrderName,
        descriere: "",
        status: "ACTIVA",
      });

      if (!created.ok) {
        console.error("Eroare la crearea comenzii noi după finalizare", created.error);
        setError(
          "Comanda a fost finalizată, dar nu s-a putut crea automat o comandă nouă. Apasă '➕ Comandă nouă'."
        );
      }

      await loadData();
    } catch (e) {
      console.error("Eroare la finalizarea comenzii", e);
      setError("Nu s-a putut finaliza comanda.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearOrder() {
    if (role === "pharmacist_staff") {
      alert("Acest cont nu are dreptul de a goli comanda.");
      return;
    }
    if (!session) return;
    if (!confirm("Sigur vrei să ștergi toate liniile din această comandă?"))
      return;

    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("order_session_id", session.id);

      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error("Eroare la golirea comenzii", e);
      setError("Nu s-a putut goli comanda.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateLineQuantity(line: OrderLine) {
    const currentQty = line.cantitate_comandata;
    const raw = prompt(
      `Cantitate nouă pentru "${
        line.medicines?.denumire || "medicament"
      }" (număr întreg):`,
      String(currentQty)
    );

    if (!raw) {
      return;
    }

    const qty = parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Te rog introdu o cantitate validă (număr întreg > 0).");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ cantitate_comandata: qty })
        .eq("id", line.id);

      if (error) {
        console.error("Eroare la actualizarea cantității liniei", error);
        setError("Nu s-a putut actualiza cantitatea.");
        return;
      }

      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLine(line: OrderLine) {
    if (role === "pharmacist_staff") {
      alert("Acest cont nu are dreptul de a șterge linii din comandă.");
      return;
    }
    if (
      !confirm(
        `Sigur vrei să ștergi linia pentru "${
          line.medicines?.denumire || "medicament"
        }" din această comandă?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase.from("orders").delete().eq("id", line.id);

      if (error) {
        console.error("Eroare la ștergerea liniei", error);
        setError("Nu s-a putut șterge linia din comandă.");
        return;
      }

      await loadData();
    } finally {
      setSaving(false);
    }
  }

  function handleLineActions(line: OrderLine) {
    setLineActionsLine(line);
    setLineActionsOpen(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă comanda activă...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      {lineActionsOpen && lineActionsLine && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !saving) setLineActionsOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-5 py-4">
              <div className="text-base font-semibold text-zinc-900">
                {lineActionsLine.medicines?.denumire || "Medicament"}
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                Cantitate: x{lineActionsLine.cantitate_comandata}
              </div>
            </div>
            <div className="space-y-2 px-5 py-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setLineActionsOpen(false);
                  void handleUpdateLineQuantity(lineActionsLine);
                }}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Modifică cantitatea
              </button>
              {role !== "pharmacist_staff" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setLineActionsOpen(false);
                    void handleDeleteLine(lineActionsLine);
                  }}
                  className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Șterge linia
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => setLineActionsOpen(false)}
                className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Comandă activă
            </h2>
            <p className="text-sm text-zinc-600">
              Vezi detalii despre comanda curentă și liniile de comandă.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {role !== "pharmacist_staff" && (
              <button
                type="button"
                onClick={handleCreateNewOrder}
                disabled={saving}
                className="rounded-full bg-blue-600 px-3 py-1 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                ➕ Comandă nouă
              </button>
            )}
            {role !== "pharmacist_staff" && (
              <button
                type="button"
                onClick={handleFinalizeOrder}
                disabled={!session || saving}
                className="rounded-full border border-green-600 px-3 py-1 font-medium text-green-700 shadow-sm transition hover:bg-green-50 disabled:opacity-60"
              >
                ✔️ Finalizează
              </button>
            )}
            {role !== "pharmacist_staff" && (
              <button
                type="button"
                onClick={handleClearOrder}
                disabled={!session || saving}
                className="rounded-full border border-red-600 px-3 py-1 font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-60"
              >
                🗑️ Golește
              </button>
            )}
          </div>
        </div>
      </header>

      {!session && !error && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
          Nu există nicio comandă activă. Creează o comandă nouă din această
          pagină.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {session && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                {session.nume_comanda || "Comandă fără nume"}
              </h3>
              <p className="text-xs text-zinc-600">
                Status: <span className="font-medium">{session.status}</span>
              </p>
              {session.descriere && session.descriere !== "EMPTY" && (
                <p className="mt-1 text-xs text-zinc-600">{session.descriere}</p>
              )}
              {/* Badge-uri departamente */}
              {lines.length > 0 && (() => {
                const counts: Record<string, number> = {};
                for (const l of lines) {
                  const d = (l.medicines?.departament ?? "").toUpperCase().trim() || "ALTELE";
                  counts[d] = (counts[d] ?? 0) + 1;
                }
                const deptColor: Record<string, string> = {
                  IMPORT: "bg-purple-100 text-purple-700",
                  TABLETA: "bg-orange-100 text-orange-700",
                  TM: "bg-teal-100 text-teal-700",
                };
                return (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(counts).sort(([a],[b]) => a.localeCompare(b)).map(([dept, cnt]) => (
                      <span key={dept} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${deptColor[dept] ?? "bg-gray-100 text-gray-600"}`}>
                        {dept} ×{cnt}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="text-right text-xs text-zinc-600">
              <p>Total medicamente: {session.total_medicamente ?? lines.length}</p>
              <p>Total cantitate: {session.total_cantitate ?? "-"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 text-sm">
              <h4 className="font-medium text-zinc-700">Linii de comandă</h4>
              <span className="text-xs text-zinc-500">{lines.length} poziții</span>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {lines.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  Nu există linii pentru această comandă.
                </div>
              )}

              {lines.length > 0 && (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {lines.map((line) => {
                    const med = line.medicines;
                    const name = med?.denumire || "-";
                    const qty = line.cantitate_comandata;
                    const concentratie = med?.concentratie || "-";
                    const cantCutie = med?.cantitate_cutie || "-";
                    const departament = med?.departament || "-";

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
                                  statusByOrderId[line.id] || "pending"
                                )}`}
                              >
                                {statusLabel(statusByOrderId[line.id] || "pending")}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-600">
                              {concentratie} • {cantCutie} • {departament}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleLineActions(line)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-blue-500 text-xs font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
                          >
                            i
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  user_id: string;
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

type OrderSession = {
  id: number;
  nume_comanda: string | null;
  descriere: string | null;
  status: string | null;
  created_at: string;
};

type OrderLine = {
  id: number;
  medicament_id: number;
  cantitate_comandata: number;
  created_at: string;
  medicines?: any;
};

type LineStatusRow = {
  order_id: number;
  status: "pending" | "in_stock" | "out_of_stock" | "sent";
  updated_at: string;
  updated_by: string;
};

function formatErr(e: unknown) {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function statusLabel(s: LineStatusRow["status"] | "pending") {
  if (s === "in_stock") return "În stoc";
  if (s === "out_of_stock") return "Nu e în stoc";
  if (s === "sent") return "Trimis";
  return "În așteptare";
}

function statusPillClass(s: LineStatusRow["status"] | "pending") {
  if (s === "in_stock") return "bg-emerald-100 text-emerald-800";
  if (s === "out_of_stock") return "bg-red-100 text-red-800";
  if (s === "sent") return "bg-blue-100 text-blue-800";
  return "bg-zinc-100 text-zinc-700";
}

export default function DeptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [statusByOrderId, setStatusByOrderId] = useState<
    Record<number, LineStatusRow["status"]>
  >({});
  const [lineActionsOpen, setLineActionsOpen] = useState(false);
  const [lineActionsLine, setLineActionsLine] = useState<OrderLine | null>(null);

  const deptLabel = useMemo(() => profile?.department || "-", [profile]);

  async function loadProfile() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login?next=/dept");
      return null;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      router.push("/login?next=/dept");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, role, department")
      .eq("user_id", userData.user.id)
      .limit(1);

    if (error) throw new Error(`profiles select: ${error.message}`);

    const p = ((data as Profile[] | null) ?? [])[0] ?? null;
    return p;
  }

  function handleLineActions(line: OrderLine) {
    setLineActionsLine(line);
    setLineActionsOpen(true);
  }

  async function loadActiveOrder(department: Profile["department"]) {
    const { data: sessions, error: sessionError } = await supabase
      .from("order_sessions")
      .select("id, nume_comanda, descriere, status, created_at")
      .eq("status", "ACTIVA")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionError) throw new Error(`order_sessions select: ${sessionError.message}`);

    const active = ((sessions as OrderSession[] | null) ?? [])[0] ?? null;
    setActiveSession(active);

    if (!active || !department) {
      setLines([]);
      setStatusByOrderId({});
      return;
    }

    const { data: orderLines, error: linesError } = await supabase
      .from("orders")
      .select(
        "id, medicament_id, cantitate_comandata, created_at, medicines(denumire, concentratie, cantitate_cutie, departament)"
      )
      .eq("order_session_id", active.id);

    if (linesError) throw new Error(`orders select: ${linesError.message}`);

    const raw: OrderLine[] = ((orderLines ?? []) as OrderLine[]);
    const filtered = raw.filter((l) => {
      const dep = (l.medicines?.departament || "").toUpperCase();
      return dep === department;
    });

    filtered.sort((a, b) => {
      const denA = (a.medicines?.denumire || "").toUpperCase();
      const denB = (b.medicines?.denumire || "").toUpperCase();
      return denA.localeCompare(denB, "ro-RO");
    });

    setLines(filtered);

    if (filtered.length === 0) {
      setStatusByOrderId({});
      return;
    }

    const ids = filtered.map((l) => l.id);
    const { data: statuses, error: statusErr } = await supabase
      .from("order_line_status")
      .select("order_id, status, updated_at, updated_by")
      .in("order_id", ids);

    if (statusErr) throw new Error(`order_line_status select: ${statusErr.message}`);

    const map: Record<number, LineStatusRow["status"]> = {};
    for (const s of ((statuses ?? []) as LineStatusRow[])) {
      map[s.order_id] = s.status;
    }
    setStatusByOrderId(map);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const p = await loadProfile();
      setProfile(p);

      if (!p) {
        setLoading(false);
        return;
      }

      if (p.role !== "department") {
        router.push("/comanda");
        return;
      }

      await loadActiveOrder(p.department);
    } catch (e) {
      console.error(e);
      const details = formatErr(e);
      setError(
        details
          ? `Nu s-au putut încărca datele departamentului: ${details}`
          : "Nu s-au putut încărca datele departamentului."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleSetStatus(orderId: number, status: LineStatusRow["status"]) {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        router.push("/login?next=/dept");
        return;
      }

      const { error } = await supabase
        .from("order_line_status")
        .upsert({
          order_id: orderId,
          status,
          updated_by: userData.user.id,
        });

      if (error) {
        console.error("Eroare la actualizarea statusului", error);
        setError("Nu s-a putut actualiza statusul.");
        return;
      }

      setStatusByOrderId((prev) => ({ ...prev, [orderId]: status }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă departamentul...
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
                  void handleSetStatus(lineActionsLine.id, "sent");
                }}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Trimis
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setLineActionsOpen(false);
                  void handleSetStatus(lineActionsLine.id, "out_of_stock");
                }}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Nu e în stoc
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setLineActionsOpen(false)}
                className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Departament: {deptLabel}
        </h2>
        <p className="text-sm text-zinc-600">
          Vezi comanda activă și confirmă statusul produselor din departamentul tău.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!activeSession && !error && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
          Nu există nicio comandă activă.
        </div>
      )}

      {activeSession && (
        <section className="space-y-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-base font-semibold text-zinc-900">
              {activeSession.nume_comanda || `Comandă #${activeSession.id}`}
            </div>
            {activeSession.descriere && activeSession.descriere !== "EMPTY" && (
              <div className="mt-1 text-xs text-zinc-600">{activeSession.descriere}</div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 text-sm">
              <h4 className="font-medium text-zinc-700">Linii (departamentul tău)</h4>
              <span className="text-xs text-zinc-500">{lines.length} poziții</span>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {lines.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  Nu există linii pentru departamentul tău.
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
                    const st = statusByOrderId[line.id] || "pending";

                    return (
                      <li key={line.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
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
                              {concentratie} • {cantCutie}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={saving}
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

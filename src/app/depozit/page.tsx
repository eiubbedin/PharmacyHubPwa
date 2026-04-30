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

type OrderSession = {
  id: number;
  nume_comanda: string | null;
  status: string | null;
  created_at: string;
};

type OrderLine = {
  id: number;
  cantitate_comandata: number;
  medicines?: {
    denumire: string | null;
    concentratie: string | null;
    cantitate_cutie: string | null;
    departament: string | null;
  };
};

type DepotPickup = {
  id: number;
  picked_at: string;
  user_id: string;
};

const DEPT_ORDER = ["IMPORT", "TABLETA", "TM"];
const DEPT_LABELS: Record<string, string> = {
  IMPORT: "IMPORT",
  TABLETA: "TABLETĂ",
  TM: "TM",
};

function normalizeDept(d: string | null | undefined): string {
  return (d ?? "").toUpperCase().trim();
}

export default function DepozitPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [search, setSearch] = useState("");
  const [activeDeptFilter, setActiveDeptFilter] = useState<string | null>(null);
  const [pickup, setPickup] = useState<DepotPickup | null>(null);
  const [pickingUp, setPickingUp] = useState(false);
  const [checkedLineIds, setCheckedLineIds] = useState<Set<number>>(new Set());
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    void loadAll();

    // Realtime subscription
    const channel = supabase
      .channel("depozit_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_sessions" },
        () => {
          void loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "depot_pickups" },
        () => {
          void loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "depot_line_checks" },
        () => {
          void loadAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login?next=/depozit"); return; }
      setUserId(user.id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", user.id)
        .limit(1);

      const p = ((profileData as Profile[] | null) ?? [])[0] ?? null;
      setProfile(p);

      if (!p || p.role !== "department") { router.push("/"); return; }

      const { data: sessions, error: sErr } = await supabase
        .from("order_sessions")
        .select("id, nume_comanda, status, created_at")
        .eq("status", "ACTIVA")
        .order("created_at", { ascending: false })
        .limit(1);

      if (sErr) throw sErr;

      const active = ((sessions as OrderSession[] | null) ?? [])[0] ?? null;
      setActiveSession(active);

      if (!active) { setLines([]); setPickup(null); setCheckedLineIds(new Set()); return; }

      const { data: orderLines, error: lErr } = await supabase
        .from("orders")
        .select("id, cantitate_comandata, medicines(denumire, concentratie, cantitate_cutie, departament)")
        .eq("order_session_id", active.id);

      if (lErr) throw lErr;

      const raw = (orderLines ?? []) as unknown as OrderLine[];
      const sorted = [...raw].sort((a, b) =>
        (a.medicines?.denumire ?? "").localeCompare(b.medicines?.denumire ?? "", "ro-RO")
      );
      setLines(sorted);

      // Încarcă preluarea existentă
      const { data: pickupData } = await supabase
        .from("depot_pickups")
        .select("id, picked_at, user_id")
        .eq("order_session_id", active.id)
        .eq("user_id", user.id)
        .limit(1);
      setPickup(((pickupData as DepotPickup[] | null) ?? [])[0] ?? null);

      // Încarcă produsele bifate
      const lineIds = sorted.map((l) => l.id);
      if (lineIds.length > 0) {
        const { data: checks } = await supabase
          .from("depot_line_checks")
          .select("order_line_id")
          .eq("user_id", user.id)
          .in("order_line_id", lineIds);
        const checked = new Set((checks ?? []).map((c: { order_line_id: number }) => c.order_line_id));
        setCheckedLineIds(checked);
      }
    } catch (e) {
      console.warn("depozit load error", e);
      setError("Nu s-au putut încărca datele.");
    } finally {
      setLoading(false);
    }
  }

  // Grupare pe departament
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = lines.filter((l) => {
      const matchSearch = !q ||
        (l.medicines?.denumire ?? "").toLowerCase().includes(q) ||
        (l.medicines?.concentratie ?? "").toLowerCase().includes(q);
      const matchDept = !activeDeptFilter ||
        normalizeDept(l.medicines?.departament) === activeDeptFilter;
      return matchSearch && matchDept;
    });

    const map: Record<string, OrderLine[]> = {};
    for (const line of filtered) {
      const dept = normalizeDept(line.medicines?.departament) || "ALTELE";
      if (!map[dept]) map[dept] = [];
      map[dept].push(line);
    }

    return DEPT_ORDER
      .filter((d) => map[d]?.length)
      .map((d) => ({ dept: d, label: DEPT_LABELS[d] ?? d, lines: map[d] }))
      .concat(
        Object.keys(map)
          .filter((d) => !DEPT_ORDER.includes(d) && map[d].length)
          .map((d) => ({ dept: d, label: d, lines: map[d] }))
      );
  }, [lines, search, activeDeptFilter]);

  const totalFiltered = grouped.reduce((s, g) => s + g.lines.length, 0);

  // Departamente unice pentru filtre
  const deptCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lines) {
      const d = normalizeDept(l.medicines?.departament) || "ALTELE";
      map[d] = (map[d] ?? 0) + 1;
    }
    return map;
  }, [lines]);

  async function handlePickup() {
    if (!activeSession || !userId || pickingUp) return;
    setPickingUp(true);
    try {
      const { data, error } = await supabase
        .from("depot_pickups")
        .upsert({ order_session_id: activeSession.id, user_id: userId }, { onConflict: "order_session_id,user_id" })
        .select("id, picked_at, user_id")
        .limit(1);
      if (error) throw error;
      setPickup(((data as DepotPickup[] | null) ?? [])[0] ?? null);

      // Trimite notificare push către farmaciști
      const sessionName = activeSession.nume_comanda || `Comandă #${activeSession.id}`;
      await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Comandă preluată de depozit",
          body: `${sessionName} a fost preluată și este în pregătire.`,
          url: "/comanda",
          targetRole: "pharmacist",
        }),
      });
    } catch (e) {
      console.warn("pickup error", e);
    } finally {
      setPickingUp(false);
    }
  }

  async function handleToggleLine(lineId: number) {
    if (!userId || togglingId !== null) return;
    setTogglingId(lineId);
    const isChecked = checkedLineIds.has(lineId);
    try {
      if (isChecked) {
        await supabase
          .from("depot_line_checks")
          .delete()
          .eq("order_line_id", lineId)
          .eq("user_id", userId);
        setCheckedLineIds((prev) => { const s = new Set(prev); s.delete(lineId); return s; });
      } else {
        await supabase
          .from("depot_line_checks")
          .upsert({ order_line_id: lineId, user_id: userId, checked: true }, { onConflict: "order_line_id,user_id" });
        setCheckedLineIds((prev) => new Set(prev).add(lineId));
      }
    } catch (e) {
      console.warn("toggle line error", e);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleExportPdf() {
    if (!activeSession || lines.length === 0) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const sessionName = activeSession.nume_comanda || `Comandă #${activeSession.id}`;
      const dateStr = new Date(activeSession.created_at).toLocaleString("ro-RO", { dateStyle: "long", timeStyle: "short" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(sessionName, 14, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(dateStr, 14, 24);
      doc.setTextColor(0);

      let y = 32;

      for (const group of grouped) {
        if (y > 270) { doc.addPage(); y = 16; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`— ${group.label} (${group.lines.length}) —`, 14, y);
        doc.setTextColor(0);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        for (const line of group.lines) {
          if (y > 278) { doc.addPage(); y = 16; }
          const med = line.medicines;
          const name = med?.denumire ?? "—";
          const conc = med?.concentratie ? ` ${med.concentratie}` : "";
          const cutie = med?.cantitate_cutie ? ` · ${med.cantitate_cutie}` : "";
          doc.text(`${name}${conc}${cutie}`, 18, y);
          doc.setFont("helvetica", "bold");
          doc.text(`x${line.cantitate_comandata}`, 185, y, { align: "right" });
          doc.setFont("helvetica", "normal");
          y += 5.5;
        }
        y += 3;
      }

      doc.save(`${sessionName.replace(/\s+/g, "_")}_depozit.pdf`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">
        Se încarcă...
      </div>
    );
  }

  const deptLabel = profile?.department ? (DEPT_LABELS[profile.department] ?? profile.department) : "—";

  return (
    <div className="flex flex-col gap-3 pb-16 sm:pb-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs text-gray-400">Conectat ca</p>
          <p className="text-base font-semibold text-gray-900">{deptLabel}</p>
        </div>
        <Link
          href="/depozit/istoric"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Istoric
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Comanda activa */}
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Comandă activă</p>

      {!activeSession && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
          Nu există nicio comandă activă în acest moment.
        </div>
      )}

      {activeSession && (
        <>
          {/* Session header + PDF */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">
                  {activeSession.nume_comanda || `Comandă #${activeSession.id}`}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {new Date(activeSession.created_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
                  {" · "}{lines.length} poziții
                  {checkedLineIds.size > 0 && (
                    <span className="ml-1.5 text-green-600 font-medium">
                      · {checkedLineIds.size}/{lines.length} bifate
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExportPdf()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                {exporting ? "Export..." : "PDF"}
              </button>
            </div>

            {/* Buton confirmare preluare */}
            {pickup ? (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2">
                <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-green-800">Comandă preluată</p>
                  <p className="text-[10px] text-green-600">
                    {new Date(pickup.picked_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={pickingUp}
                onClick={() => void handlePickup()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {pickingUp ? "Se confirmă..." : "Am preluat comanda"}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Caută medicament..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filtre departament */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveDeptFilter(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !activeDeptFilter
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Toate ({lines.length})
            </button>
            {DEPT_ORDER.filter((d) => deptCounts[d]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDeptFilter(activeDeptFilter === d ? null : d)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeDeptFilter === d
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {DEPT_LABELS[d] ?? d} ({deptCounts[d]})
              </button>
            ))}
          </div>

          {/* Linii grupate */}
          {totalFiltered === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-sm text-gray-400">
              Niciun produs găsit.
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.dept} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {/* Dept header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.label}
                </span>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                  {group.lines.length}
                </span>
              </div>
              {group.lines.map((line, idx) => {
                const med = line.medicines;
                const isChecked = checkedLineIds.has(line.id);
                const isToggling = togglingId === line.id;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${isChecked ? "bg-green-50" : ""} ${idx < group.lines.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => void handleToggleLine(line.id)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isChecked
                          ? "border-green-500 bg-green-500"
                          : "border-gray-300 bg-white hover:border-green-400"
                      } disabled:opacity-50`}
                    >
                      {isChecked && (
                        <svg className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-sm font-medium ${isChecked ? "text-gray-400 line-through" : "text-gray-900"}`}>{med?.denumire || "—"}</span>
                        {med?.concentratie && (
                          <span className={`text-sm ${isChecked ? "text-gray-400" : "text-gray-500"}`}>{med.concentratie}</span>
                        )}
                      </div>
                      {med?.cantitate_cutie && (
                        <p className="text-xs text-gray-400">{med.cantitate_cutie}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${isChecked ? "text-gray-400" : "text-green-600"}`}>
                      x{line.cantitate_comandata}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

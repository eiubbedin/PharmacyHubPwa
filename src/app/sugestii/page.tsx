"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addOrUpdateMedicineInActiveOrder, getActiveOrderMedicineIds } from "@/lib/orderUtils";

type Suggestion = {
  medicament_id: number;
  total_cantitate: number;
  sesiuni: number;
  medicines?: {
    denumire: string | null;
    concentratie: string | null;
    cantitate_cutie: string | null;
    departament: string | null;
  } | null;
};

type Statistics = {
  totalComenzi: number;
  totalMedicamente: number;
  totalCantitate: number;
  topDepartament: string;
  avgCantitatePerComanda: number;
};

export default function SugestiiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [activeOrderMedicineIds, setActiveOrderMedicineIds] = useState<number[]>([]);

  async function refreshActiveOrderMedicineIds() {
    const ids = await getActiveOrderMedicineIds();
    setActiveOrderMedicineIds(ids);
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

      const { data, error } = await supabase
        .from("orders")
        .select(
          "medicament_id, cantitate_comandata, medicines(denumire, concentratie, cantitate_cutie, departament)"
        );

      if (error) {
        console.error("Eroare la încărcarea sugestiilor", error);
        setError("Nu s-au putut încărca sugestiile.");
        setLoading(false);
        return;
      }

      // Obține și statistici generale
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("order_sessions")
        .select("id, total_medicamente, total_cantitate");

      if (!sessionsError && sessionsData) {
        const sessions = sessionsData as any[];
        const totalComenzi = sessions.length;
        const totalMedicamente = sessions.reduce((sum, s) => sum + (s.total_medicamente || 0), 0);
        const totalCantitate = sessions.reduce((sum, s) => sum + (s.total_cantitate || 0), 0);
        const avgCantitatePerComanda = totalComenzi > 0 ? Math.round(totalCantitate / totalComenzi) : 0;

        // Calculează top departament
        const deptCounts: Record<string, number> = {};
        for (const row of data as any[]) {
          const dept = row.medicines?.[0]?.departament || row.medicines?.departament || 'NECUNOSCUT';
          deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        }
        const topDept = Object.entries(deptCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || 'NECUNOSCUT';

        setStats({
          totalComenzi,
          totalMedicamente,
          totalCantitate,
          topDepartament: topDept,
          avgCantitatePerComanda
        });
      }

      const raw = (data as any[]) ?? [];
      const byMed: Record<number, Suggestion> = {};

      for (const row of raw) {
        const id = row.medicament_id as number;
        if (!byMed[id]) {
          byMed[id] = {
            medicament_id: id,
            total_cantitate: 0,
            sesiuni: 0,
            medicines: row.medicines?.[0] ?? row.medicines ?? null,
          };
        }
        byMed[id].total_cantitate += row.cantitate_comandata ?? 0;
        byMed[id].sesiuni += 1;
      }

      const list = Object.values(byMed).sort((a, b) => {
        if (b.sesiuni !== a.sesiuni) {
          return b.sesiuni - a.sesiuni;
        }
        return b.total_cantitate - a.total_cantitate;
      });

      setItems(list.slice(0, 100));
      setLoading(false);
    }

    load();
  }, [router]);

  useEffect(() => {
    void refreshActiveOrderMedicineIds();
  }, []);

  async function handleAddToActiveOrder(item: Suggestion) {
    if (!item.medicines) return;

    setSaving(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const qtyRaw = prompt(
        `Cantitate pentru sugestie "${
          item.medicines?.denumire || "medicament"
        }" (număr întreg):`,
        String(Math.max(1, Math.round(item.total_cantitate / item.sesiuni)))
      );
      if (!qtyRaw) {
        setSaving(false);
        return;
      }

      const qty = parseInt(qtyRaw, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        alert("Te rog introdu o cantitate validă (număr întreg > 0).");
        setSaving(false);
        return;
      }

      const res = await addOrUpdateMedicineInActiveOrder({
        medicamentId: item.medicament_id,
        qty,
        medicineName: item.medicines?.denumire || "medicament",
      });

      if (!res.ok) {
        if (res.error.includes("Nu există nicio comandă activă")) {
          alert(res.error);
          router.push("/comanda");
          return;
        }
        setError(res.error);
        return;
      }

      await refreshActiveOrderMedicineIds();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă sugestiile...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      <header className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Sugestii
        </h2>
        <p className="text-sm text-zinc-600">
          Top 100 cele mai comandate medicamente din toate comenzile anterioare.
        </p>
      </header>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalComenzi}</div>
            <div className="text-xs text-zinc-500">Comenzi totale</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.totalMedicamente}</div>
            <div className="text-xs text-zinc-500">Medicamente unice</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.totalCantitate.toLocaleString()}</div>
            <div className="text-xs text-zinc-500">Bucăți totale</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.avgCantitatePerComanda}</div>
            <div className="text-xs text-zinc-500">Medie/comandă</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <div className="text-lg font-bold text-pink-600">{stats.topDepartament}</div>
            <div className="text-xs text-zinc-500">Top departament</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const inOrder = activeOrderMedicineIds.includes(item.medicament_id);
          return (
          <div
            key={item.medicament_id}
            className={`flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm ${
              inOrder ? "bg-blue-50/60" : ""
            }`}
          >
            <div className="min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <div className="truncate font-medium text-zinc-900">
                  {item.medicines?.denumire || "-"}
                </div>
                {inOrder && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                    În comandă
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-zinc-600">
                {item.medicines?.concentratie || "-"}
                {item.medicines?.cantitate_cutie
                  ? ` • ${item.medicines.cantitate_cutie}`
                  : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                  {item.medicines?.departament || "-"}
                </span>
                <span>{item.sesiuni} sesiuni</span>
                <span>{item.total_cantitate} buc.</span>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleAddToActiveOrder(item)}
              className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              + Adaugă
            </button>
          </div>
          );
        })}

        {items.length === 0 && !error && (
          <p className="text-sm text-zinc-500">
            Nu există suficient istoric pentru a calcula sugestii.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type OrderSession = {
  id: number;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
};

type OrderLine = {
  cantitate_comandata: number;
  medicament_id: number;
  order_session_id: number;
  medicines?: { denumire: string | null; departament: string | null } | null;
};

type StatsData = {
  totalComenzi: number;
  totalFinalizate: number;
  totalProduse: number;
  totalCantitate: number;
  byMonth: { luna: string; comenzi: number; cantitate: number }[];
  byDept: { dept: string; cantitate: number }[];
  topProduse: { denumire: string; total: number }[];
};

const DEPT_COLORS: Record<string, string> = {
  IMPORT: "#8b5cf6",
  TABLETA: "#f97316",
  TM: "#14b8a6",
  ALTELE: "#94a3b8",
};

const MONTH_NAMES = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1);

      const role = (profileData as any[])?.[0]?.role;
      if (role !== "pharmacist_admin") { router.push("/"); return; }

      const { data: sessions, error: sErr } = await supabase
        .from("order_sessions")
        .select("id, status, created_at, total_medicamente, total_cantitate")
        .order("created_at", { ascending: true });

      if (sErr) throw sErr;

      const { data: lines, error: lErr } = await supabase
        .from("orders")
        .select("cantitate_comandata, medicament_id, order_session_id, medicines(denumire, departament)");

      if (lErr) throw lErr;

      const sess = (sessions as OrderSession[]) ?? [];
      const rawLines = (lines ?? []) as unknown as OrderLine[];

      // Totale
      const totalComenzi = sess.length;
      const totalFinalizate = sess.filter((s) => s.status === "FINALIZATA").length;
      const totalProduse = sess.reduce((s, c) => s + (c.total_medicamente ?? 0), 0);
      const totalCantitate = sess.reduce((s, c) => s + (c.total_cantitate ?? 0), 0);

      // By month (ultimele 12 luni)
      const monthMap: Record<string, { comenzi: number; cantitate: number }> = {};
      for (const s of sess) {
        const d = new Date(s.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthMap[key]) monthMap[key] = { comenzi: 0, cantitate: 0 };
        monthMap[key].comenzi += 1;
        monthMap[key].cantitate += s.total_cantitate ?? 0;
      }
      const sortedMonths = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([key, val]) => {
          const [y, m] = key.split("-");
          return { luna: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`, ...val };
        });

      // By dept
      const deptMap: Record<string, number> = {};
      for (const l of rawLines) {
        const med = (l.medicines as any)?.[0] ?? l.medicines;
        const d = ((med?.departament ?? "") as string).toUpperCase().trim() || "ALTELE";
        deptMap[d] = (deptMap[d] ?? 0) + (l.cantitate_comandata ?? 0);
      }
      const byDept = Object.entries(deptMap)
        .map(([dept, cantitate]) => ({ dept, cantitate }))
        .sort((a, b) => b.cantitate - a.cantitate);

      // Top 10 produse
      const prodMap: Record<number, { denumire: string; total: number }> = {};
      for (const l of rawLines) {
        const med = (l.medicines as any)?.[0] ?? l.medicines;
        const id = l.medicament_id;
        if (!prodMap[id]) prodMap[id] = { denumire: med?.denumire ?? `#${id}`, total: 0 };
        prodMap[id].total += l.cantitate_comandata ?? 0;
      }
      const topProduse = Object.values(prodMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      setStats({ totalComenzi, totalFinalizate, totalProduse, totalCantitate, byMonth: sortedMonths, byDept, topProduse });
    } catch (e) {
      console.error(e);
      setError("Nu s-au putut încărca datele.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">
        Se încarcă dashboard-ul...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-col gap-5 pb-16 sm:pb-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total comenzi", value: stats.totalComenzi, color: "text-blue-600" },
          { label: "Finalizate", value: stats.totalFinalizate, color: "text-green-600" },
          { label: "Produse comandate", value: stats.totalProduse, color: "text-purple-600" },
          { label: "Total bucăți", value: stats.totalCantitate, color: "text-orange-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white px-4 py-4">
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString("ro-RO")}</div>
            <div className="mt-0.5 text-xs text-gray-500">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Comenzi pe lună */}
      {stats.byMonth.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Comenzi pe lună</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byMonth} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="luna" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, name: any) => [String(val), name === "comenzi" ? "Comenzi" : "Cantitate"] as any}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="comenzi" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Comenzi" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cantitate pe lună */}
      {stats.byMonth.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Cantitate totală pe lună</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byMonth} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="luna" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(val: any) => [String(val), "Bucăți"] as any} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="cantitate" fill="#f97316" radius={[4, 4, 0, 0]} name="Cantitate" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Distribuție departamente */}
      {stats.byDept.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Distribuție pe departamente (bucăți)</h3>
          <div className="flex flex-col items-center sm:flex-row sm:items-start gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.byDept}
                  dataKey="cantitate"
                  nameKey="dept"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label={({ name, percent }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stats.byDept.map((entry) => (
                    <Cell key={entry.dept} fill={DEPT_COLORS[entry.dept] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip formatter={(val: any) => [typeof val === "number" ? val.toLocaleString("ro-RO") : String(val), "bucăți"] as any} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top 10 produse */}
      {stats.topProduse.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Top 10 produse comandate</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={stats.topProduse}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="denumire"
                width={130}
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + "…" : v}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(val: any) => [String(val), "bucăți"] as any} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Bucăți" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  role: string;
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

type OrderSession = {
  id: number;
  nume_comanda: string | null;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
};

export default function DepozitIstoricPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderSession[]>([]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login?next=/depozit/istoric"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", user.id)
        .limit(1);

      const p = ((profileData as Profile[] | null) ?? [])[0] ?? null;
      if (!p || p.role !== "department") { router.push("/"); return; }

      const { data: sessions, error: sErr } = await supabase
        .from("order_sessions")
        .select("id, nume_comanda, status, created_at, total_medicamente, total_cantitate")
        .order("created_at", { ascending: false });

      if (sErr) throw sErr;
      setItems((sessions as OrderSession[] | null) ?? []);
    } catch (e) {
      console.warn("depozit istoric error", e);
      setError("Nu s-au putut încărca comenzile.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">
        Se încarcă...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-16 sm:pb-4">
      <Link
        href="/depozit"
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Înapoi
      </Link>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Istoric comenzi
      </p>

      {items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
          Nu există comenzi înregistrate.
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {items.map((s, idx) => {
            const isActive = s.status === "ACTIVA";
            const isFinalized = s.status === "FINALIZATA";
            return (
              <Link
                key={s.id}
                href={`/depozit/istoric/${s.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                  idx < items.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
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
                    {new Date(s.created_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
                    {" · "}{s.total_medicamente ?? 0} med.
                    {" · "}{s.total_cantitate ?? "-"} buc.
                  </p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

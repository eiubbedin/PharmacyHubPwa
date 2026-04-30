"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

const DEPT_LABELS: Record<string, string> = {
  IMPORT: "IMPORT",
  TABLETA: "TABLETĂ",
  TM: "TM",
};

export default function DepozitPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login?next=/depozit"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", user.id)
        .limit(1);

      const p = ((profileData as Profile[] | null) ?? [])[0] ?? null;
      setProfile(p);

      if (!p || p.role !== "department") {
        router.push("/");
        return;
      }

      // Fetch comanda activa
      const { data: sessions, error: sErr } = await supabase
        .from("order_sessions")
        .select("id, nume_comanda, status, created_at")
        .eq("status", "ACTIVA")
        .order("created_at", { ascending: false })
        .limit(1);

      if (sErr) throw sErr;

      const active = ((sessions as OrderSession[] | null) ?? [])[0] ?? null;
      setActiveSession(active);

      if (!active) { setLines([]); return; }

      // Fetch toate liniile comenzii active (fara filtru pe departament)
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
    } catch (e) {
      console.warn("depozit load error", e);
      setError("Nu s-au putut încărca datele.");
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

  const deptLabel = profile?.department ? (DEPT_LABELS[profile.department] ?? profile.department) : "—";

  return (
    <div className="flex flex-col gap-4 pb-16 sm:pb-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header info */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs text-gray-400">Departament</p>
        <p className="text-lg font-semibold text-gray-900">{deptLabel}</p>
      </div>

      {/* Link spre istoric */}
      <Link
        href="/depozit/istoric"
        className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>Istoric comenzi</span>
        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Comanda activa */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Comandă activă</p>

        {!activeSession && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
            Nu există nicio comandă activă în acest moment.
          </div>
        )}

        {activeSession && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* Session header */}
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="font-semibold text-gray-900">
                {activeSession.nume_comanda || `Comandă #${activeSession.id}`}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {new Date(activeSession.created_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
                {" · "}
                {lines.length} poziții
              </p>
            </div>

            {/* Lines — read only */}
            {lines.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Nu există produse din departamentul {deptLabel} în această comandă.
              </div>
            )}

            {lines.map((line, idx) => {
              const med = line.medicines;
              return (
                <div
                  key={line.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < lines.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{med?.denumire || "—"}</span>
                      {med?.concentratie && (
                        <span className="text-sm text-gray-500">{med.concentratie}</span>
                      )}
                    </div>
                    {med?.cantitate_cutie && (
                      <p className="text-xs text-gray-400">{med.cantitate_cutie}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-green-600">
                    x{line.cantitate_comandata}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

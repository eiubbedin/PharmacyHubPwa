"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
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

export default function DepozitIstoricDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Number(params?.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", user.id)
        .limit(1);

      const p = ((profileData as Profile[] | null) ?? [])[0] ?? null;
      if (!p || p.role !== "department") { router.push("/"); return; }
      setProfile(p);

      const { data: sessionData, error: sErr } = await supabase
        .from("order_sessions")
        .select("id, nume_comanda, status, created_at")
        .eq("id", sessionId)
        .limit(1);

      if (sErr) throw sErr;
      const s = ((sessionData as OrderSession[] | null) ?? [])[0] ?? null;
      setSession(s);

      if (!s) { setLines([]); return; }

      const { data: orderLines, error: lErr } = await supabase
        .from("orders")
        .select("id, cantitate_comandata, medicines(denumire, concentratie, cantitate_cutie, departament)")
        .eq("order_session_id", s.id);

      if (lErr) throw lErr;

      const raw = (orderLines ?? []) as unknown as OrderLine[];
      const dept = p.department?.toUpperCase();
      const filtered = raw
        .filter((l) => (l.medicines?.departament ?? "").toUpperCase() === dept)
        .sort((a, b) =>
          (a.medicines?.denumire ?? "").localeCompare(b.medicines?.denumire ?? "", "ro-RO")
        );

      setLines(filtered);
    } catch (e) {
      console.warn("depozit detail error", e);
      setError("Nu s-au putut încărca detaliile comenzii.");
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
  const isActive = session?.status === "ACTIVA";
  const isFinalized = session?.status === "FINALIZATA";

  return (
    <div className="flex flex-col gap-3 pb-16 sm:pb-4">
      <Link
        href="/depozit/istoric"
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Înapoi la istoric
      </Link>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {session && (
        <>
          {/* Session info */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900">
                {session.nume_comanda || `Comandă #${session.id}`}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isActive ? "bg-green-100 text-green-700" :
                isFinalized ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                {session.status || "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(session.created_at).toLocaleString("ro-RO", { dateStyle: "long", timeStyle: "short" })}
            </p>
          </div>

          {/* Lines */}
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Produse – {deptLabel} ({lines.length})
          </p>

          {lines.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
              Nu există produse din departamentul {deptLabel} în această comandă.
            </div>
          )}

          {lines.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
                    <span className="shrink-0 text-sm font-semibold text-gray-700">
                      x{line.cantitate_comandata}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

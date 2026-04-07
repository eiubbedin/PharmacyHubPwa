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

function groupKey(dep: string) {
  return (dep || "-").toUpperCase();
}

export default function AlteDepartamentePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);

  const deptLabel = useMemo(() => profile?.department || "-", [profile]);

  async function loadProfile() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login?next=/dept/alte-departamente");
      return null;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      router.push("/login?next=/dept/alte-departamente");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, role, department")
      .eq("user_id", userData.user.id)
      .limit(1);

    if (error) throw error;

    return ((data as Profile[] | null) ?? [])[0] ?? null;
  }

  async function loadOtherDepartments(myDept: Profile["department"]) {
    const { data: sessions, error: sessionError } = await supabase
      .from("order_sessions")
      .select("id, nume_comanda, descriere, status, created_at")
      .eq("status", "ACTIVA")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionError) throw sessionError;

    const active = ((sessions as OrderSession[] | null) ?? [])[0] ?? null;
    setActiveSession(active);

    if (!active || !myDept) {
      setLines([]);
      return;
    }

    const { data: orderLines, error: linesError } = await supabase
      .from("orders")
      .select(
        "id, medicament_id, cantitate_comandata, created_at, medicines(denumire, concentratie, cantitate_cutie, departament)"
      )
      .eq("order_session_id", active.id);

    if (linesError) throw linesError;

    const raw: OrderLine[] = ((orderLines ?? []) as OrderLine[]);
    const filtered = raw.filter((l) => {
      const dep = (l.medicines?.departament || "").toUpperCase();
      return dep && dep !== myDept;
    });

    filtered.sort((a, b) => {
      const depA = groupKey(a.medicines?.departament);
      const depB = groupKey(b.medicines?.departament);
      if (depA !== depB) return depA.localeCompare(depB, "ro-RO");

      const denA = (a.medicines?.denumire || "").toUpperCase();
      const denB = (b.medicines?.denumire || "").toUpperCase();
      return denA.localeCompare(denB, "ro-RO");
    });

    setLines(filtered);
  }

  useEffect(() => {
    async function load() {
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

        await loadOtherDepartments(p.department);
      } catch (e) {
        console.error(e);
        setError("Nu s-au putut încărca datele.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function handleClaimLine(line: OrderLine) {
    if (saving) return;
    if (!profile?.department) return;
    const medId = Number(line.medicament_id);
    if (!Number.isFinite(medId) || medId <= 0) return;

    const ok = window.confirm(
      `Acest produs face parte din departamentul tău (${profile.department})?`
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login?next=/dept/alte-departamente");
        return;
      }

      const res = await fetch("/api/dept/claim-medicine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ medicine_id: medId }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Nu s-a putut actualiza departamentul.");
        return;
      }

      await loadOtherDepartments(profile.department);
    } catch (e) {
      console.error(e);
      setError("Nu s-a putut actualiza departamentul.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      <header className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Alte departamente
        </h2>
        <p className="text-sm text-zinc-600">
          Liniile din comanda activă care nu țin de departamentul tău ({deptLabel}).
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
              <h4 className="font-medium text-zinc-700">Linii</h4>
              <span className="text-xs text-zinc-500">{lines.length} poziții</span>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {lines.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  Nu există linii în alte departamente.
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
                      <li key={line.id} className="px-4 py-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleClaimLine(line)}
                          className="w-full text-left disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {name} x{qty}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-600">
                              {concentratie} • {cantCutie} • {departament}
                            </p>
                          </div>
                        </button>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

interface OrderSession {
  id: number;
  nume_comanda: string | null;
  descriere: string | null;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
}

export default function ComenziPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderSession[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function load() {
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
          .select("role, department")
          .eq("user_id", userData.user.id)
          .limit(1);
        setProfile(((p as Profile[] | null) ?? [])[0] ?? null);
      } else {
        setProfile(null);
      }

      const { data, error } = await supabase
        .from("order_sessions")
        .select(
          "id, nume_comanda, descriere, status, created_at, total_medicamente, total_cantitate"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Eroare la încărcarea istoricului de comenzi", error);
        setError("Nu s-au putut încărca comenzile.");
        setLoading(false);
        return;
      }

      setItems((data as OrderSession[]) ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  const isDepartment = profile?.role === "department";
  const isPharmacistStaff = profile?.role === "pharmacist_staff";

  async function handleDeleteSession(session: OrderSession, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isPharmacistStaff) {
      alert("Acest cont nu are dreptul de a șterge comenzi din istoric.");
      return;
    }

    if (session.status === "ACTIVA") {
      alert("Nu poți șterge o comandă activă. Finalizeaz-o mai întâi.");
      return;
    }

    if (
      !confirm(
        `Sigur vrei să ștergi definitiv comanda "${
          session.nume_comanda || `Comandă #${session.id}`
        }" și toate liniile ei?`
      )
    ) {
      return;
    }

    // Ștergem întâi liniile de comandă, apoi sesiunea
    const { error: ordersError } = await supabase
      .from("orders")
      .delete()
      .eq("order_session_id", session.id);

    if (ordersError) {
      console.error("Eroare la ștergerea liniilor comenzii", ordersError);
      alert("Nu s-au putut șterge liniile comenzii.");
      return;
    }

    const { error: sessionError } = await supabase
      .from("order_sessions")
      .delete()
      .eq("id", session.id);

    if (sessionError) {
      console.error("Eroare la ștergerea comenzii", sessionError);
      alert("Nu s-a putut șterge comanda.");
      return;
    }

    setItems((prev) => prev.filter((s) => s.id !== session.id));
  }

  async function handleRenameSession(session: OrderSession, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isPharmacistStaff) {
      alert("Acest cont nu are dreptul de a redenumi comenzi.");
      return;
    }

    const newName = prompt(
      `Redenumește comanda "${session.nume_comanda || `Comandă #${session.id}`}"`,
      session.nume_comanda || ""
    );

    if (!newName || newName.trim() === "") return;
    if (newName.trim() === session.nume_comanda) return;

    try {
      const { error } = await supabase
        .from("order_sessions")
        .update({ nume_comanda: newName.trim() })
        .eq("id", session.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((s) =>
          s.id === session.id ? { ...s, nume_comanda: newName.trim() } : s
        )
      );
    } catch (error) {
      console.error("Eroare la redenumirea comenzii", error);
      alert("Nu s-a putut redenumi comanda.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă istoricul de comenzi...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      <header className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Istoric comenzi
        </h2>
        <p className="text-sm text-zinc-600">
          Toate sesiunile de comandă efectuate anterior.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2 text-sm">
        {items.map((s) => {
          const created = new Date(s.created_at);
          const dateLabel = created.toLocaleString("ro-RO", {
            dateStyle: "short",
            timeStyle: "short",
          });

          const statusColor =
            s.status === "ACTIVA"
              ? "bg-emerald-100 text-emerald-800"
              : s.status === "FINALIZATA"
              ? "bg-blue-100 text-blue-800"
              : "bg-zinc-100 text-zinc-700";

          return (
            <Link
              key={s.id}
              href={`/comenzi/${s.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {s.nume_comanda || `Comandă #${s.id}`}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                  {s.descriere && s.descriere !== "EMPTY"
                    ? s.descriere
                    : "Fără descriere"}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {dateLabel} • {s.total_medicamente ?? 0} medicamente •
                  {" "}
                  {s.total_cantitate ?? "-"} buc.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-right text-[11px]">
                <span className={`rounded-full px-2 py-0.5 font-medium ${statusColor}`}>
                  {s.status || "-"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">Detalii ›</span>
                  {!isDepartment && !isPharmacistStaff && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleRenameSession(s, e)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-orange-300 text-[10px] font-semibold text-orange-600 hover:bg-orange-50"
                        aria-label="Redenumește comanda"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(s, e)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-300 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                        aria-label="Șterge comanda"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {items.length === 0 && !error && (
          <p className="text-sm text-zinc-500">
            Nu există comenzi înregistrate încă.
          </p>
        )}
      </div>
    </div>
  );
}

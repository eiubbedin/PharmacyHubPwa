"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addOrUpdateMedicineInActiveOrder, getActiveOrderMedicineIds } from "@/lib/orderUtils";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

type Medicine = {
  id: number;
  denumire: string | null;
  producer: string | null;
  concentratie: string | null;
  cantitate_cutie: string | null;
  departament: string | null;
  med_type: string | null;
};

type MedicineDraft = {
  denumire: string;
  producer: string;
  concentratie: string;
  cantitate_cutie: string;
  departament: string;
  med_type: string;
};

function normalizeMedType(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const key = s.toUpperCase();
  const mapping: Record<string, string> = {
    RX: "RX",
    OTC: "OTC",
    SUPLEMENT: "SUPLEMENT",
    "SUPLIMENT ALIMENTAR": "SUPLEMENT",
    "DISPOZITIV MEDICAL": "DISPOZITIV MEDICAL",
    COSMETIC: "COSMETIC",
  };
  return mapping[key] ?? key;
}

function MedicineFormModal(props: {
  open: boolean;
  title: string;
  submitLabel: string;
  initial: MedicineDraft;
  medTypeOptions: string[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (draft: MedicineDraft) => void;
}) {
  const { open, title, submitLabel, initial, medTypeOptions, saving, onCancel, onSubmit } = props;
  const [draft, setDraft] = useState<MedicineDraft>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, saving]);

  if (!open) return null;

  const canSubmit = draft.denumire.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !saving) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">{title}</div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <input
              value={draft.denumire}
              onChange={(e) => setDraft((d) => ({ ...d, denumire: e.target.value }))}
              placeholder="Denumire"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <input
              value={draft.producer}
              onChange={(e) => setDraft((d) => ({ ...d, producer: e.target.value }))}
              placeholder="Producător"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <input
              value={draft.concentratie}
              onChange={(e) => setDraft((d) => ({ ...d, concentratie: e.target.value }))}
              placeholder="Concentrație (ex: 500mg)"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <input
              value={draft.cantitate_cutie}
              onChange={(e) => setDraft((d) => ({ ...d, cantitate_cutie: e.target.value }))}
              placeholder="Cantitate/cutie (ex: x20cpr.)"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={draft.med_type}
              onChange={(e) => setDraft((d) => ({ ...d, med_type: e.target.value }))}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tip medicament</option>
              {medTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-1">
            <div className="text-sm font-medium text-zinc-700">Departament</div>
            <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-100 p-2">
              {(["IMPORT", "TABLETA", "TM"] as const).map((dep) => {
                const active = draft.departament === dep;
                return (
                  <button
                    key={dep}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, departament: dep }))}
                    className={
                      active
                        ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow"
                        : "rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700"
                    }
                  >
                    {dep}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-zinc-200 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-2xl bg-zinc-100 px-4 py-3 text-base font-medium text-zinc-900 disabled:opacity-60"
          >
            Anulează
          </button>
          <button
            type="button"
            onClick={() => onSubmit(draft)}
            disabled={saving || !canSubmit}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Se salvează..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeOrderMedicineIds, setActiveOrderMedicineIds] = useState<number[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("TOATE");
  const [medicineFormOpen, setMedicineFormOpen] = useState(false);
  const [medicineFormTitle, setMedicineFormTitle] = useState<string>("");
  const [medicineFormSubmitLabel, setMedicineFormSubmitLabel] = useState<string>("");
  const [medicineFormInitial, setMedicineFormInitial] = useState<MedicineDraft>({
    denumire: "",
    producer: "",
    concentratie: "",
    cantitate_cutie: "",
    departament: "IMPORT",
    med_type: "",
  });
  const [medicineFormEditingId, setMedicineFormEditingId] = useState<number | null>(null);
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  const [actionsMedicine, setActionsMedicine] = useState<Medicine | null>(null);

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
    }

    load();
  }, [router]);

  const isDepartment = profile?.role === "department";
  const isPharmacistStaff = profile?.role === "pharmacist_staff";

  async function refreshActiveOrderMedicineIds() {
    if (isDepartment) {
      setActiveOrderMedicineIds([]);
      return;
    }
    const ids = await getActiveOrderMedicineIds();
    setActiveOrderMedicineIds(ids);
  }

  useEffect(() => {
    if (!profile) return;
    void refreshActiveOrderMedicineIds();
  }, [profile]);

  useEffect(() => {
    if (!actionsModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        setActionsModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionsModalOpen, saving]);

  // Obține lista de departamente unice
  const departments = ["TOATE", ...Array.from(new Set(medicines.map(m => m.departament).filter(Boolean)))];

  const medTypeOptions = Array.from(
    new Set(medicines.map((m) => m.med_type).filter(Boolean))
  ) as string[];

  medTypeOptions.sort((a, b) => a.localeCompare(b, "ro-RO"));

  // Filtrare medicamente după departament și căutare
  const filteredMedicines = medicines.filter(medicine => {
    const matchesDept = selectedDept === "TOATE" || medicine.departament === selectedDept;
    const matchesSearch = query.trim() === "" || 
      medicine.denumire?.toLowerCase().includes(query.toLowerCase()) ||
      medicine.producer?.toLowerCase().includes(query.toLowerCase()) ||
      medicine.concentratie?.toLowerCase().includes(query.toLowerCase()) ||
      medicine.cantitate_cutie?.toLowerCase().includes(query.toLowerCase()) ||
      medicine.med_type?.toLowerCase().includes(query.toLowerCase());
    return matchesDept && matchesSearch;
  });

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      // Când există text de căutare, filtrăm direct în Supabase cu ilike
      // pe denumire/concentrație/cantitate_cutie. În lipsa textului, încărcăm
      // ultimele medicamente și sortăm local pe departament + denumire.
      const trimmed = query.trim();

      let baseQuery = supabase
        .from("medicines")
        .select("id, denumire, producer, concentratie, cantitate_cutie, departament, med_type");

      if (trimmed) {
        const pattern = `%${trimmed.toLowerCase()}%`;
        baseQuery = baseQuery.or(
          `denumire.ilike.${pattern},producer.ilike.${pattern},concentratie.ilike.${pattern},cantitate_cutie.ilike.${pattern},med_type.ilike.${pattern}`
        );
        // IMPORTANT: PostgREST may cap results (often ~1000) if no limit/range is set.
        // This was causing some medicines to never show up during search.
        baseQuery = baseQuery.limit(20000);
      } else {
        baseQuery = baseQuery.order("id", { ascending: false }).limit(5000);
      }

      const { data, error } = await baseQuery;

      if (error) {
        console.error("Eroare la încărcarea medicamentelor", error);
        setError("Nu s-au putut încărca medicamentele.");
        setLoading(false);
        return;
      }

      const raw: Medicine[] = (data as Medicine[]) ?? [];

      raw.sort((a, b) => {
        const depA = (a.departament || "").toUpperCase();
        const depB = (b.departament || "").toUpperCase();
        if (depA !== depB) return depA.localeCompare(depB, "ro-RO");

        const denA = (a.denumire || "").toUpperCase();
        const denB = (b.denumire || "").toUpperCase();
        return denA.localeCompare(denB, "ro-RO");
      });

      setMedicines(raw);
      setLoading(false);
    }

    load();
  }, [router, query]);

  async function reloadMedicines() {
    const trimmed = query.trim();

    let baseQuery = supabase
      .from("medicines")
      .select("id, denumire, producer, concentratie, cantitate_cutie, departament, med_type");

    if (trimmed) {
      const pattern = `%${trimmed.toLowerCase()}%`;
      baseQuery = baseQuery.or(
        `denumire.ilike.${pattern},producer.ilike.${pattern},concentratie.ilike.${pattern},cantitate_cutie.ilike.${pattern},med_type.ilike.${pattern}`
      );
      // IMPORTANT: PostgREST may cap results (often ~1000) if no limit/range is set.
      // This was causing some medicines to never show up during search.
      baseQuery = baseQuery.limit(20000);
    } else {
      baseQuery = baseQuery.order("id", { ascending: false }).limit(5000);
    }

    const { data, error } = await baseQuery;

    if (error) {
      console.error("Eroare la reîncărcarea medicamentelor", error);
      setError("Nu s-au putut reîncărca medicamentele.");
      return;
    }

    const raw: Medicine[] = (data as Medicine[]) ?? [];

    raw.sort((a, b) => {
      const depA = (a.departament || "").toUpperCase();
      const depB = (b.departament || "").toUpperCase();
      if (depA !== depB) return depA.localeCompare(depB, "ro-RO");

      const denA = (a.denumire || "").toUpperCase();
      const denB = (b.denumire || "").toUpperCase();
      return denA.localeCompare(denB, "ro-RO");
    });

    setMedicines(raw);
  }

  async function handleAddToActiveOrder(medicine: Medicine) {
    if (isDepartment) {
      alert("Conturile de departament nu pot adăuga în comandă din Nomenclator.");
      return;
    }
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
        `Cantitate pentru "${medicine.denumire || "medicament"}" (număr întreg):`,
        "1"
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
        medicamentId: medicine.id,
        qty,
        medicineName: medicine.denumire || "medicament",
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

  async function handleEditMedicine(medicine: Medicine) {
    setError(null);
    setMedicineFormEditingId(medicine.id);
    setMedicineFormTitle("Editează medicament");
    setMedicineFormSubmitLabel("Salvează");
    setMedicineFormInitial({
      denumire: medicine.denumire || "",
      producer: medicine.producer || "",
      concentratie: medicine.concentratie || "",
      cantitate_cutie: medicine.cantitate_cutie || "",
      departament: (medicine.departament || "IMPORT").toUpperCase(),
      med_type: medicine.med_type || "",
    });
    setMedicineFormOpen(true);
  }

  async function handleDeleteMedicine(medicine: Medicine) {
    if (isDepartment || isPharmacistStaff) {
      alert("Acest cont nu are dreptul de a șterge medicamente.");
      return;
    }
    if (
      !confirm(
        `Sigur vrei să ștergi medicamentul "${
          medicine.denumire || "medicament"
        }" definitiv?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Verificăm întâi dacă există comenzi care folosesc acest medicament
      const { data: usedOrders, error: checkError } = await supabase
        .from("orders")
        .select("id")
        .eq("medicament_id", medicine.id)
        .limit(1);

      if (checkError) {
        console.error("Eroare la verificarea utilizărilor medicamentului", checkError);
        setError("Nu s-a putut verifica dacă medicamentul este folosit în comenzi.");
        return;
      }

      if ((usedOrders as { id: number }[] | null)?.length) {
        alert(
          "Nu poți șterge acest medicament pentru că există comenzi care îl folosesc. Poți eventual să îl redenumești sau să îl marchezi altfel."
        );
        return;
      }

      const { error } = await supabase
        .from("medicines")
        .delete()
        .eq("id", medicine.id);

      if (error) {
        console.error("Eroare la ștergerea medicamentului", error);
        setError("Nu s-a putut șterge medicamentul.");
        return;
      }

      await reloadMedicines();
    } finally {
      setSaving(false);
    }
  }

  function handleMedicineActions(medicine: Medicine) {
    setActionsMedicine(medicine);
    setActionsModalOpen(true);
  }

  async function handleCreateMedicine() {
    setError(null);
    setMedicineFormEditingId(null);
    setMedicineFormTitle("Adaugă medicament nou");
    setMedicineFormSubmitLabel("Adaugă");
    setMedicineFormInitial({
      denumire: "",
      producer: "",
      concentratie: "",
      cantitate_cutie: "",
      departament: "IMPORT",
      med_type: "",
    });
    setMedicineFormOpen(true);
  }

  async function handleSubmitMedicineForm(draft: MedicineDraft) {
    setSaving(true);
    setError(null);

    try {
      const dep = (draft.departament || "IMPORT").toUpperCase();
      const allowed = ["IMPORT", "TABLETA", "TM"] as const;
      const departament = allowed.includes(dep as any) ? dep : "IMPORT";
      const medType = normalizeMedType(draft.med_type);

      if (medicineFormEditingId) {
        const { error } = await supabase
          .from("medicines")
          .update({
            denumire: draft.denumire.trim(),
            producer: draft.producer.trim() ? draft.producer.trim() : null,
            concentratie: draft.concentratie.trim() ? draft.concentratie.trim() : null,
            cantitate_cutie: draft.cantitate_cutie.trim() ? draft.cantitate_cutie.trim() : null,
            departament,
            med_type: medType ? medType : null,
          })
          .eq("id", medicineFormEditingId);

        if (error) {
          console.error("Eroare la editarea medicamentului", error);
          setError("Nu s-a putut edita medicamentul.");
          return;
        }
      } else {
        const { error: insertError } = await supabase.from("medicines").insert({
          denumire: draft.denumire.trim(),
          producer: draft.producer.trim() ? draft.producer.trim() : null,
          concentratie: draft.concentratie.trim() ? draft.concentratie.trim() : null,
          cantitate_cutie: draft.cantitate_cutie.trim() ? draft.cantitate_cutie.trim() : null,
          departament,
          med_type: medType ? medType : null,
        });

        if (insertError) {
          console.error("Eroare la adăugarea medicamentului", insertError);
          setError("Nu s-a putut adăuga medicamentul în nomenclator.");
          return;
        }
      }

      setMedicineFormOpen(false);
      setMedicineFormEditingId(null);
      await reloadMedicines();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <MedicineFormModal
        open={medicineFormOpen}
        title={medicineFormTitle}
        submitLabel={medicineFormSubmitLabel}
        initial={medicineFormInitial}
        medTypeOptions={medTypeOptions}
        saving={saving}
        onCancel={() => {
          if (saving) return;
          setMedicineFormOpen(false);
          setMedicineFormEditingId(null);
        }}
        onSubmit={(draft) => void handleSubmitMedicineForm(draft)}
      />

      {actionsModalOpen && actionsMedicine && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !saving) setActionsModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-5 py-4">
              <div className="text-base font-semibold text-zinc-900">
                {actionsMedicine.denumire || "Medicament"}
              </div>
            </div>
            <div className="space-y-2 px-5 py-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setActionsModalOpen(false);
                  void handleEditMedicine(actionsMedicine);
                }}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Editează
              </button>
              {!isDepartment && !isPharmacistStaff && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setActionsModalOpen(false);
                    void handleDeleteMedicine(actionsMedicine);
                  }}
                  className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Șterge
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => setActionsModalOpen(false)}
                className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Comenzi Medicamente F35
          </h1>
          <p className="text-sm text-zinc-600">
            Nomenclator medicamente (date în timp real din Supabase).
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1">
            <input
              type="text"
              placeholder="Caută medicament..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-700">Departament:</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {departments.map((dept) => (
                <option key={dept || 'TOATE'} value={dept || 'TOATE'}>
                  {dept || 'TOATE'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="flex flex-col">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-700">
              Lista medicamentelor
            </h2>
            <span className="text-xs text-zinc-500">
              {loading
                ? "Se încarcă..."
                : `Total: ${filteredMedicines.length} înregistrări`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCreateMedicine}
            disabled={saving}
            className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            + Medicament nou
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 sm:px-4">Produs</th>
                <th className="px-3 py-2 sm:px-4 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    Se încarcă medicamentele...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-red-600"
                  >
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error &&
                filteredMedicines.map((m) => (
                  (() => {
                    const inOrder = !isDepartment && activeOrderMedicineIds.includes(m.id);
                    return (
                  <tr
                    key={m.id}
                    className={`cursor-default border-t border-zinc-100 odd:bg-white even:bg-zinc-50/60 ${
                      inOrder ? "bg-blue-50/60" : ""
                    }`}
                  >
                    <td className="px-3 py-2 sm:px-4 align-top">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-zinc-900">
                          {m.denumire || "-"}
                        </div>
                        {inOrder && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                            În comandă
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {m.concentratie || "-"}
                        {m.cantitate_cutie ? ` • ${m.cantitate_cutie}` : ""}
                        {m.departament ? ` • ${m.departament}` : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {!isDepartment && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleAddToActiveOrder(m)}
                          className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                        >
                          Adaugă
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMedicineActions(m)}
                        className="ml-2 inline-flex items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                    );
                  })()
                ))}

              {!loading && !error && filteredMedicines.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    Nu există medicamente care corespund filtrelor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

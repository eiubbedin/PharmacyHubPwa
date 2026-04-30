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
        const prof = ((p as Profile[] | null) ?? [])[0] ?? null;
        setProfile(prof);
        if (prof?.role === "department") {
          router.replace("/depozit");
          return;
        }
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
    <div className="flex flex-col gap-3">
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

      {/* Actions sheet */}
      {actionsModalOpen && actionsMedicine && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
          onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setActionsModalOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-base font-semibold text-gray-900 truncate">{actionsMedicine.denumire || "Medicament"}</p>
              {actionsMedicine.producer && (
                <p className="mt-0.5 text-xs text-gray-500">{actionsMedicine.producer}</p>
              )}
            </div>
            <div className="p-2 space-y-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => { setActionsModalOpen(false); void handleEditMedicine(actionsMedicine); }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editează
              </button>
              {!isDepartment && !isPharmacistStaff && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => { setActionsModalOpen(false); void handleDeleteMedicine(actionsMedicine); }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Șterge din nomenclator
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => setActionsModalOpen(false)}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + New */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Caută medicament..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleCreateMedicine}
          disabled={saving}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Medicament nou</span>
          <span className="sm:hidden">Nou</span>
        </button>
      </div>

      {/* Dept filter */}
      <div className="flex flex-wrap gap-1.5">
        {departments.map((dept) => {
          const active = selectedDept === (dept || "TOATE");
          return (
            <button
              key={dept || "TOATE"}
              type="button"
              onClick={() => setSelectedDept(dept || "TOATE")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {dept || "TOATE"}
            </button>
          );
        })}
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400">
        {loading ? "Se încarcă..." : `${filteredMedicines.length} medicamente`}
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-px overflow-hidden rounded-xl border border-gray-200 bg-white">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-gray-50" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredMedicines.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
          Nu există medicamente care corespund filtrelor.
        </div>
      )}

      {/* Medicine list — iOS grouped list style */}
      {!loading && !error && filteredMedicines.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {filteredMedicines.map((m, idx) => {
            const inOrder = !isDepartment && activeOrderMedicineIds.includes(m.id);
            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < filteredMedicines.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                {/* Left content */}
                <div className="min-w-0 flex-1">
                  {/* Line 1: name + concentration */}
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className={`text-sm leading-snug ${inOrder ? "font-semibold text-green-600" : "font-medium text-gray-900"}`}>
                      {m.denumire || "—"}
                    </span>
                    {m.concentratie && (
                      <span className={`text-sm ${inOrder ? "text-green-500" : "text-gray-500"}`}>
                        {m.concentratie}
                      </span>
                    )}
                  </div>
                  {/* Line 2: dept | type | producer */}
                  <p className="mt-0.5 text-xs text-gray-400 truncate">
                    {[m.departament, m.med_type, m.producer].filter(Boolean).join(" | ")}
                  </p>
                  {/* Line 3: cantitate cutie */}
                  {m.cantitate_cutie && (
                    <p className="text-[11px] text-gray-300">{m.cantitate_cutie}</p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {!isDepartment && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleAddToActiveOrder(m)}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 transition-colors ${
                        inOrder
                          ? "bg-green-50 text-green-700 hover:bg-green-100"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      {inOrder ? "Mod." : "Add"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleMedicineActions(m)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

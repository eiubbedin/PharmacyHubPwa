"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addOrUpdateMedicineInActiveOrder, getActiveOrderMedicineIds } from "@/lib/orderUtils";

type LineStatus = "pending" | "in_stock" | "out_of_stock" | "sent";

type OrderSession = {
  id: number;
  nume_comanda: string | null;
  descriere: string | null;
  status: string | null;
  created_at: string;
  total_medicamente: number | null;
  total_cantitate: number | null;
};

type OrderLine = {
  id: number;
  medicament_id: number;
  cantitate_comandata: number;
  created_at: string;
  medicines?: {
    denumire: string | null;
    concentratie: string | null;
    cantitate_cutie: string | null;
    departament: string | null;
  };
};

type ReceptionItem = {
  orderLine: OrderLine;
  cantitatePrimita: number;
  cantitateRamasa: number;
  diferenta: number;
  status: 'COMPLET' | 'PARTIAL' | 'MISSING';
  received: boolean;
  outOfStock: boolean;
};

export default function ReceptiePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<OrderSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<OrderSession | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [receptionItems, setReceptionItems] = useState<ReceptionItem[]>([]);
  const [activeOrderMedicineIds, setActiveOrderMedicineIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<
    "CONFIRM_RECEIVED" | "CONFIRM_ADD_BACK" | "CHOOSE_QTY" | "CUSTOM_QTY" | null
  >(null);
  const [dialogItem, setDialogItem] = useState<ReceptionItem | null>(null);
  const [customQty, setCustomQty] = useState<string>("1");

  async function refreshActiveOrderMedicineIds() {
    const ids = await getActiveOrderMedicineIds();
    setActiveOrderMedicineIds(ids);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession) {
        router.push("/login");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", userData.user.id)
          .limit(1);
        const role = ((p as { role: string }[] | null) ?? [])[0]?.role;
        if (role === "pharmacist_staff") {
          alert("Acest cont nu are acces la Recepție.");
          router.replace("/comanda");
          return;
        }
      }

      await refreshActiveOrderMedicineIds();

      // Obține toate sesiunile finalizate
      const { data: sessions, error: sessionsError } = await supabase
        .from("order_sessions")
        .select("*")
        .eq("status", "FINALIZATA")
        .order("created_at", { ascending: false });

      if (sessionsError) {
        console.error("Eroare la încărcarea sesiunilor", sessionsError);
        setError("Nu s-au putut încărca sesiunile.");
        setLoading(false);
        return;
      }

      const finalizedSessions = (sessions as OrderSession[]) ?? [];
      setAllSessions(finalizedSessions);
      
      // Selectează automat ultima sesiune
      if (finalizedSessions.length > 0) {
        setSelectedSession(finalizedSessions[0]);
      }
      
      setLoading(false);
    }

    load();
  }, [router]);

  // Când se schimbă sesiunea selectată, încarcă liniile comenzii
  useEffect(() => {
    if (!selectedSession) return;

    async function loadOrderLines() {
      setOrderLines([]);
      setReceptionItems([]);

      // Obține liniile comenzii
      const { data: lines, error: linesError } = await supabase
        .from("orders")
        .select(
          "id, medicament_id, cantitate_comandata, created_at, medicines(denumire, concentratie, cantitate_cutie, departament)"
        )
        .eq("order_session_id", selectedSession!.id)
        .order("created_at", { ascending: true });

      if (linesError) {
        console.error("Eroare la încărcarea liniilor comenzii", linesError);
        setError("Nu s-au putut încărca liniile comenzii.");
        return;
      }

      const rawLines: OrderLine[] = ((lines ?? []) as unknown[]).map((row: any) => ({
        id: row.id,
        medicament_id: row.medicament_id,
        cantitate_comandata: row.cantitate_comandata,
        created_at: row.created_at,
        medicines: Array.isArray(row.medicines) ? row.medicines[0] : row.medicines
      }));
      
      setOrderLines(rawLines);

      // Încarcă statusurile departamentelor pentru liniile acestei comenzi
      const statusMap: Record<number, LineStatus> = {};
      if (rawLines.length > 0) {
        const ids = rawLines.map((l) => l.id);
        const { data: statuses, error: stErr } = await supabase
          .from("order_line_status")
          .select("order_id, status")
          .in("order_id", ids);

        if (stErr) {
          console.error("Eroare la încărcarea statusurilor", stErr);
        } else {
          for (const row of ((statuses ?? []) as { order_id: number; status: LineStatus }[])) {
            statusMap[row.order_id] = row.status;
          }
        }
      }

      // Încarcă cantitățile primite salvate (persistență recepție)
      const receivedQtyMap: Record<number, number> = {};
      if (rawLines.length > 0) {
        const ids = rawLines.map((l) => l.id);
        const { data: recRows, error: recErr } = await supabase
          .from("reception_lines")
          .select("order_id, cantitate_primita")
          .in("order_id", ids);

        if (recErr) {
          console.error("Eroare la încărcarea recepției salvate", recErr);
        } else {
          for (const row of ((recRows ?? []) as { order_id: number; cantitate_primita: number }[])) {
            receivedQtyMap[row.order_id] = row.cantitate_primita;
          }
        }
      }

      // Creează elemente de recepție
      const items: ReceptionItem[] = rawLines.map(line => ({
        orderLine: line,
        cantitatePrimita: receivedQtyMap[line.id] ?? 0,
        cantitateRamasa: (receivedQtyMap[line.id] ?? 0) - line.cantitate_comandata,
        diferenta: (receivedQtyMap[line.id] ?? 0) - line.cantitate_comandata,
        status:
          (receivedQtyMap[line.id] ?? 0) >= line.cantitate_comandata
            ? ('COMPLET' as const)
            : (receivedQtyMap[line.id] ?? 0) > 0
              ? ('PARTIAL' as const)
              : ('MISSING' as const),
        received: (receivedQtyMap[line.id] ?? 0) > 0,
        outOfStock: (statusMap[line.id] || "pending") === "out_of_stock",
      }));

      setReceptionItems(items);
    }

    loadOrderLines();
  }, [selectedSession]);

  async function persistReceptionQty(orderId: number, qty: number) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      router.push("/login?next=/receptie");
      return;
    }

    const { error: upsertErr } = await supabase
      .from("reception_lines")
      .upsert(
        {
          order_id: orderId,
          cantitate_primita: qty,
          checked_by: userData.user.id,
        },
        { onConflict: "order_id" }
      );

    if (upsertErr) {
      console.error("Eroare la autosalvarea recepției", upsertErr);
      setError("Nu s-a putut salva automat recepția. Apasă «Salvează» sau reîncearcă.");
    }
  }

  async function handleAddBackOutOfStock(item: ReceptionItem) {
    if (!item.outOfStock) return;
    if (saving) return;

    if (!confirm(`Adaugi din nou în comanda activă "${
      item.orderLine.medicines?.denumire || "medicament"
    }" (x${item.orderLine.cantitate_comandata})?`)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        router.push("/login?next=/receptie");
        return;
      }

      const res = await addOrUpdateMedicineInActiveOrder({
        medicamentId: item.orderLine.medicament_id,
        qty: item.orderLine.cantitate_comandata,
        medicineName: item.orderLine.medicines?.denumire || "medicament",
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

      // Resetăm statusul liniei vechi ca să nu mai apară ca Neprimit în recepție
      const { error: stErr } = await supabase
        .from("order_line_status")
        .upsert({
          order_id: item.orderLine.id,
          status: "pending",
          updated_by: userData.user.id,
        });

      if (stErr) {
        console.error("Eroare la resetarea statusului", stErr);
      }

      // Eliminăm din lista de recepție (deja a fost adăugat în comanda nouă)
      setReceptionItems((prev) => prev.filter((i) => i.orderLine.id !== item.orderLine.id));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCantitatePrimita(item: ReceptionItem, cantitate: number) {
    setSaving(true);
    try {
      setReceptionItems(prev =>
        prev.map(i =>
          i.orderLine.id === item.orderLine.id
            ? {
                ...i,
                cantitatePrimita: cantitate,
                cantitateRamasa: cantitate - item.orderLine.cantitate_comandata,
                diferenta: cantitate - item.orderLine.cantitate_comandata,
                status: cantitate >= item.orderLine.cantitate_comandata 
                  ? 'COMPLET' as const 
                  : cantitate > 0 
                    ? 'PARTIAL' as const 
                    : 'MISSING' as const,
                received: cantitate > 0,
              }
            : i
        )
      );

      await persistReceptionQty(item.orderLine.id, cantitate);
    } finally {
      setSaving(false);
    }
  }

  function openDialog(item: ReceptionItem) {
    setDialogItem(item);
    setDialogStep("CONFIRM_RECEIVED");
    setCustomQty(String(item.orderLine.cantitate_comandata));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setDialogStep(null);
    setDialogItem(null);
  }

  async function handleDialogReceived() {
    if (!dialogItem) return;
    await handleUpdateCantitatePrimita(
      dialogItem,
      dialogItem.orderLine.cantitate_comandata
    );
    closeDialog();
  }

  function handleDialogNotReceived() {
    setDialogStep("CONFIRM_ADD_BACK");
  }

  function handleDialogCancel() {
    closeDialog();
  }

  function handleDialogAddBackYes() {
    setDialogStep("CHOOSE_QTY");
  }

  function handleDialogAddBackNo() {
    closeDialog();
  }

  async function addBackToActiveOrder(qty: number) {
    if (!dialogItem) return;
    const name = dialogItem.orderLine.medicines?.denumire || "medicament";

    setSaving(true);
    setError(null);
    try {
      const res = await addOrUpdateMedicineInActiveOrder({
        medicamentId: dialogItem.orderLine.medicament_id,
        qty,
        medicineName: name,
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

      await handleUpdateCantitatePrimita(dialogItem, 0);
      closeDialog();
    } finally {
      setSaving(false);
    }
  }

  async function handleChooseQtyOriginal() {
    if (!dialogItem) return;
    await addBackToActiveOrder(dialogItem.orderLine.cantitate_comandata);
  }

  function handleChooseQtyOther() {
    setDialogStep("CUSTOM_QTY");
  }

  async function handleCustomQtyConfirm() {
    const qty = parseInt(customQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Te rog introdu o cantitate validă (număr întreg > 0). ");
      return;
    }
    await addBackToActiveOrder(qty);
  }

  async function handleSaveReception() {
    if (!selectedSession) return;
    
    if (!confirm("Sigur vrei să salvezi starea de recepție?")) return;

    setSaving(true);
    setError(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        router.push("/login?next=/receptie");
        return;
      }

      const payload = receptionItems.map((item) => ({
        order_id: item.orderLine.id,
        cantitate_primita: item.cantitatePrimita,
        checked_by: userData.user.id,
      }));

      const { error: upsertErr } = await supabase
        .from("reception_lines")
        .upsert(payload, { onConflict: "order_id" });

      if (upsertErr) {
        console.error("Eroare la salvarea recepției", upsertErr);
        setError("Nu s-a putut salva starea de recepție.");
        return;
      }

      alert("Starea de recepție a fost salvată cu succes!");
    } catch (e) {
      console.error("Eroare la salvarea recepției", e);
      setError("Nu s-a putut salva starea de recepție.");
    } finally {
      setSaving(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'COMPLET': return 'bg-green-100 text-green-800';
      case 'PARTIAL': return 'bg-yellow-100 text-yellow-800';
      case 'MISSING': return 'bg-red-100 text-red-800';
      default: return 'bg-zinc-100 text-zinc-800';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'COMPLET': return 'Complet';
      case 'PARTIAL': return 'Parțial';
      case 'MISSING': return 'Neprimit';
      default: return 'Necunoscut';
    }
  }

  const stats = {
    totalProduse: receptionItems.length,
    primite: receptionItems.filter((i) => i.received).length,
    lipsa: receptionItems.filter((i) => !i.received).length,
    totalComandat: receptionItems.reduce(
      (sum, i) => sum + i.orderLine.cantitate_comandata,
      0
    ),
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-600">
        Se încarcă datele de recepție...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-6">
      <header className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Recepție
        </h2>
        <p className="text-sm text-zinc-600">
          Verificarea ultimei comenzi finalizate.
        </p>
      </header>

      {!selectedSession && !error && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center text-sm text-zinc-500">
          Nu există comenzi finalizate pentru verificare.
        </div>
      )}

      {selectedSession && (
        <>
          {/* Selector comandă */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-zinc-900">Selectează comanda pentru recepție</h4>
                <p className="text-xs text-zinc-500">Alege comanda pe care vrei să o verifici</p>
              </div>
              <select
                value={selectedSession.id}
                onChange={(e) => {
                  const session = allSessions.find(s => s.id === parseInt(e.target.value));
                  if (session) setSelectedSession(session);
                }}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.nume_comanda || `Comandă #${session.id}`} - {new Date(session.created_at).toLocaleDateString('ro-RO')}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Informații comandă */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {selectedSession.nume_comanda || `Comandă #${selectedSession.id}`}
                </h3>
                <p className="text-xs text-zinc-500">
                  {selectedSession.descriere && selectedSession.descriere !== "EMPTY"
                    ? selectedSession.descriere
                    : "Fără descriere"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Finalizată: {new Date(selectedSession.created_at).toLocaleString("ro-RO")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-right text-[11px]">
                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-medium">
                  FINALIZATA
                </span>
                <span>{selectedSession.total_medicamente || 0} medicamente</span>
                <span>{selectedSession.total_cantitate || 0} buc.</span>
              </div>
            </div>
          </section>

          {/* Statistici recepție */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-medium text-zinc-900 mb-3">Statistici recepție</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-zinc-900">{stats.totalProduse}</div>
                <div className="text-xs text-zinc-500">Produse</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{stats.primite}</div>
                <div className="text-xs text-zinc-500">Primite</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{stats.lipsa}</div>
                <div className="text-xs text-zinc-500">Lipsă</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{stats.totalComandat}</div>
                <div className="text-xs text-zinc-500">Comandat</div>
              </div>
            </div>
          </section>

          {/* Listă produse recepție */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <h4 className="text-sm font-medium text-zinc-900">
                Produse de verificat ({receptionItems.length})
              </h4>
              <button
                type="button"
                onClick={handleSaveReception}
                disabled={saving}
                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Se salvează..." : "Salvează"}
              </button>
            </div>

            {receptionItems.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                Nu există produse pentru această comandă.
              </div>
            )}

            {receptionItems.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {receptionItems.map((item) => {
                  const name = item.orderLine.medicines?.denumire || "-";
                  const conc = item.orderLine.medicines?.concentratie || "-";
                  const cutie = item.orderLine.medicines?.cantitate_cutie || "-";
                  const qty = item.orderLine.cantitate_comandata;
                  const inOrder = activeOrderMedicineIds.includes(item.orderLine.medicament_id);

                  return (
                    <li
                      key={item.orderLine.id}
                      className={
                        item.received
                          ? "bg-green-50 px-4 py-3"
                          : item.outOfStock
                            ? "bg-red-50 px-4 py-3"
                            : inOrder
                              ? "bg-blue-50/60 px-4 py-3"
                              : "px-4 py-3"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {name} x{qty}
                            </p>
                            {inOrder && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                                În comandă
                              </span>
                            )}
                            {item.received ? (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                                Primit
                              </span>
                            ) : (
                              <span
                                className={
                                  item.outOfStock
                                    ? "rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800"
                                    : "rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800"
                                }
                              >
                                {item.outOfStock ? "Neprimit" : "Lipsă"}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-600">
                            {conc} • {cutie}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.outOfStock && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleAddBackOutOfStock(item)}
                              className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Adaugă în comanda nouă
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (item.outOfStock) {
                                void handleAddBackOutOfStock(item);
                                return;
                              }
                              openDialog(item);
                            }}
                            className="rounded-full border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            {item.outOfStock ? "Neprimit" : "Verifică"}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {dialogOpen && dialogItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={handleDialogCancel}
          />

          <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                {dialogItem.orderLine.medicines?.denumire || "Medicament"}
              </div>
              <div className="text-xs text-zinc-600">
                Comandat: {dialogItem.orderLine.cantitate_comandata}
              </div>

              {dialogStep === "CONFIRM_RECEIVED" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleDialogReceived}
                    className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    PRIMIT
                  </button>
                  <button
                    type="button"
                    onClick={handleDialogNotReceived}
                    className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    NU
                  </button>
                  <button
                    type="button"
                    onClick={handleDialogCancel}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    CANCEL
                  </button>
                </div>
              )}

              {dialogStep === "CONFIRM_ADD_BACK" && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-medium text-zinc-900">
                    Adaugi în comanda activă?
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDialogAddBackYes}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      ADAUGĂ
                    </button>
                    <button
                      type="button"
                      onClick={handleDialogAddBackNo}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {dialogStep === "CHOOSE_QTY" && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-medium text-zinc-900">
                    Cantitate pentru comanda activă
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleChooseQtyOriginal}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700"
                    >
                      ORIGINALĂ
                    </button>
                    <button
                      type="button"
                      onClick={handleChooseQtyOther}
                      className="rounded-xl border border-blue-300 bg-white px-3 py-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      ALTĂ
                    </button>
                    <button
                      type="button"
                      onClick={handleDialogCancel}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {dialogStep === "CUSTOM_QTY" && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-medium text-zinc-900">
                    Altă cantitate
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCustomQtyConfirm}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      CONFIRM
                    </button>
                    <button
                      type="button"
                      onClick={handleDialogCancel}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

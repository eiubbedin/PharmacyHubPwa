"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type MedicineRow = {
  id: number;
  denumire: string | null;
  concentratie: string | null;
  cantitate_cutie: string | null;
  departament: string | null;
  producer: string | null;
  med_type: string | null;
  stoc: number | null;
};

type OrderSessionRow = {
  id: number;
  order_number: string | null;
  name: string | null;
  status: string | null;
  created_at: string | null;
  sent_at: string | null;
  closed_at: string | null;
  notes: string | null;
};

type OrderItemRow = {
  id: number;
  order_session_id: number;
  medicine_id: number;
  qty_ordered: number;
  qty_received: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type MeResponse =
  | { ok: true; email: string; isAdmin: boolean; adminsCount: number }
  | { ok: false; error: string };

type ImportResponse =
  | { ok: true; total: number; inserted: number; updated: number }
  | { ok: false; error: string };

type ImportOrdersResponse =
  | { ok: true; sessionsImported: number; linesImported: number }
  | { ok: false; error: string };

type SqlJsInit = (config?: {
  locateFile?: (file: string) => string;
}) => Promise<{ Database: new (data?: Uint8Array) => { exec: (sql: string) => { columns: string[]; values: any[][] }[] } }>;

declare global {
  interface Window {
    initSqlJs?: SqlJsInit;
  }
}

let sqlJsInitPromise: Promise<SqlJsInit> | null = null;

async function getSqlJsInit(): Promise<SqlJsInit> {
  if (sqlJsInitPromise) return sqlJsInitPromise;

  sqlJsInitPromise = (async () => {
    // IMPORTANT: avoid bundling sql.js in Turbopack (it references `fs`).
    // Also, Safari/iOS can be picky about module imports from Blob URLs.
    // Load it as a classic script and read window.initSqlJs.
    if (typeof window !== "undefined" && window.initSqlJs) {
      return window.initSqlJs;
    }

    const jsUrl = "https://unpkg.com/sql.js@1.13.0/dist/sql-wasm.js";
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-sqljs="1"]'
      ) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("sql.js load error")));
        return;
      }

      const script = document.createElement("script");
      script.src = jsUrl;
      script.async = true;
      script.defer = true;
      script.dataset.sqljs = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Nu s-a putut încărca sql.js de pe CDN."));
      document.head.appendChild(script);
    });

    if (typeof window === "undefined" || !window.initSqlJs) {
      throw new Error("sql.js nu s-a inițializat în browser.");
    }

    return window.initSqlJs;
  })();

  return sqlJsInitPromise;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [adminsCount, setAdminsCount] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<MedicineRow[]>([]);
  const [report, setReport] = useState<{ inserted: number; updated: number } | null>(null);
  const [orderSessions, setOrderSessions] = useState<OrderSessionRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [ordersReport, setOrdersReport] = useState<{ sessions: number; lines: number } | null>(null);

  const preview = useMemo(() => rows.slice(0, 20), [rows]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login?next=/admin");
        return;
      }

      try {
        const res = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const json = (await res.json()) as MeResponse;
        if (!json.ok) {
          setError(json.error);
          setLoading(false);
          return;
        }

        setEmail(json.email);
        setIsAdmin(json.isAdmin);
        setAdminsCount(json.adminsCount);
        if (!json.isAdmin) setError("Nu ai acces admin.");
      } catch {
        setError("Nu s-a putut verifica accesul admin.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  async function handleSwitchAccount() {
    if (saving) return;
    setError(null);
    try {
      await supabase.auth.signOut();
    } finally {
      router.push("/login?next=/admin");
    }
  }

  async function handleExportCsv() {
    if (saving) return;
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login?next=/admin");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/export-medicines", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        let msg = "Eroare la export.";
        try {
          const json = (await res.json()) as any;
          if (json?.error) msg = String(json.error);
        } catch {
          // ignore
        }
        setError(msg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const cd = res.headers.get("content-disposition") || "";
      const m = /filename="([^"]+)"/i.exec(cd);
      a.download = m?.[1] || "medicines.csv";

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError("Eroare la export.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportOrders() {
    setError(null);
    setOrdersReport(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      setError("Nu ai acces admin.");
      return;
    }

    if (!orderSessions.length) {
      setError("Nu există sesiuni de comenzi de importat (order_sessions).");
      return;
    }

    if (!confirm(`Importăm ${orderSessions.length} sesiuni și ${orderItems.length} linii în Supabase?`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/import-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ sessions: orderSessions, items: orderItems }),
      });

      const json = (await res.json()) as ImportOrdersResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }

      setOrdersReport({ sessions: json.sessionsImported, lines: json.linesImported });
    } catch (e) {
      console.error(e);
      setError("Eroare la import comenzi.");
    } finally {
      setSaving(false);
    }
  }

  function handleResyncNomenclator() {
    if (saving) return;
    router.push("/");
    router.refresh();
  }

  async function handleChooseFile(file: File) {
    setError(null);
    setReport(null);

    setOrdersReport(null);
    setRows([]);
    setOrderSessions([]);
    setOrderItems([]);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();

      const init = await getSqlJsInit();
      const SQL = await init({
        locateFile: (f: string) => `https://unpkg.com/sql.js@1.13.0/dist/${f}`,
      });

      const db = new SQL.Database(new Uint8Array(buf));
      const result = db.exec(
        "SELECT id, denumire, concentratie, cantitate_cutie, departament, producer, med_type, stoc FROM medicines ORDER BY id"
      );

      if (!result.length) {
        setError("Nu am găsit tabelul medicines în fișierul DB.");
        return;
      }

      const columns = result[0].columns;
      const values = result[0].values;

      const colIndex = (name: string) => columns.indexOf(name);
      const idxId = colIndex("id");
      const idxDen = colIndex("denumire");
      const idxConc = colIndex("concentratie");
      const idxCut = colIndex("cantitate_cutie");
      const idxDep = colIndex("departament");
      const idxProducer = colIndex("producer");
      const idxMedType = colIndex("med_type");
      const idxStoc = colIndex("stoc");

      if (idxId === -1) {
        setError("Coloana id lipsește din medicines.");
        return;
      }

      const parsed: MedicineRow[] = values
        .map((row: any[]) => ({
          id: Number(row[idxId]),
          denumire: idxDen >= 0 ? (row[idxDen] ?? null) : null,
          concentratie: idxConc >= 0 ? (row[idxConc] ?? null) : null,
          cantitate_cutie: idxCut >= 0 ? (row[idxCut] ?? null) : null,
          departament: idxDep >= 0 ? (row[idxDep] ?? null) : null,
          producer: idxProducer >= 0 ? (row[idxProducer] ?? null) : null,
          med_type: idxMedType >= 0 ? (row[idxMedType] ?? null) : null,
          stoc: idxStoc >= 0 ? (row[idxStoc] == null ? null : Number(row[idxStoc])) : null,
        }))
        .filter((m: MedicineRow) => Number.isFinite(m.id) && m.id > 0);

      setRows(parsed);

      // Optional: PharmacyCatalog orders import
      try {
        const sessRes = db.exec(
          "SELECT id, order_number, name, status, created_at, sent_at, closed_at, notes FROM order_sessions ORDER BY id"
        );
        if (sessRes.length) {
          const sessCols = sessRes[0].columns;
          const sessVals = sessRes[0].values;
          const c = (name: string) => sessCols.indexOf(name);
          const idxSid = c("id");
          const idxOn = c("order_number");
          const idxName = c("name");
          const idxStatus = c("status");
          const idxCreated = c("created_at");
          const idxSent = c("sent_at");
          const idxClosed = c("closed_at");
          const idxNotes = c("notes");

          if (idxSid >= 0) {
            const sessionsParsed: OrderSessionRow[] = sessVals
              .map((r: any[]) => ({
                id: Number(r[idxSid]),
                order_number: idxOn >= 0 ? (r[idxOn] ?? null) : null,
                name: idxName >= 0 ? (r[idxName] ?? null) : null,
                status: idxStatus >= 0 ? (r[idxStatus] ?? null) : null,
                created_at: idxCreated >= 0 ? (r[idxCreated] ?? null) : null,
                sent_at: idxSent >= 0 ? (r[idxSent] ?? null) : null,
                closed_at: idxClosed >= 0 ? (r[idxClosed] ?? null) : null,
                notes: idxNotes >= 0 ? (r[idxNotes] ?? null) : null,
              }))
              .filter((s: OrderSessionRow) => Number.isFinite(s.id) && s.id > 0);
            setOrderSessions(sessionsParsed);
          }
        }

        const itemsRes = db.exec(
          "SELECT id, order_session_id, medicine_id, qty_ordered, qty_received, created_at, updated_at FROM order_items ORDER BY id"
        );
        if (itemsRes.length) {
          const itemCols = itemsRes[0].columns;
          const itemVals = itemsRes[0].values;
          const c = (name: string) => itemCols.indexOf(name);
          const idxId2 = c("id");
          const idxSession = c("order_session_id");
          const idxMed = c("medicine_id");
          const idxQty = c("qty_ordered");
          const idxRecv = c("qty_received");
          const idxCreated2 = c("created_at");
          const idxUpdated2 = c("updated_at");

          if (idxSession >= 0 && idxMed >= 0) {
            const itemsParsed: OrderItemRow[] = itemVals
              .map((r: any[]) => ({
                id: idxId2 >= 0 ? Number(r[idxId2]) : 0,
                order_session_id: Number(r[idxSession]),
                medicine_id: Number(r[idxMed]),
                qty_ordered: idxQty >= 0 ? Number(r[idxQty] ?? 0) : 0,
                qty_received: idxRecv >= 0 ? (r[idxRecv] == null ? null : Number(r[idxRecv])) : null,
                created_at: idxCreated2 >= 0 ? (r[idxCreated2] ?? null) : null,
                updated_at: idxUpdated2 >= 0 ? (r[idxUpdated2] ?? null) : null,
              }))
              .filter(
                (it: OrderItemRow) =>
                  Number.isFinite(it.order_session_id) &&
                  it.order_session_id > 0 &&
                  Number.isFinite(it.medicine_id) &&
                  it.medicine_id > 0
              );
            setOrderItems(itemsParsed);
          }
        }
      } catch {
        // ignore: DB fără tabelele de comenzi
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      setError(msg ? `Eroare la citirea fișierului DB: ${msg}` : "Eroare la citirea fișierului DB.");
    }
  }

  async function handleImport() {
    setError(null);
    setReport(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      setError("Nu ai acces admin.");
      return;
    }

    if (!rows.length) {
      setError("Nu există medicamente de importat.");
      return;
    }

    if (!confirm(`Importăm ${rows.length} medicamente în Supabase?`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/import-medicines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ medicines: rows }),
      });

      const json = (await res.json()) as ImportResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }

      setReport({ inserted: json.inserted, updated: json.updated });
    } catch (e) {
      console.error(e);
      setError("Eroare la import.");
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
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Admin</h2>
        <p className="text-sm text-zinc-600">
          Import medicamente din <span className="font-medium">pharmacy_ios.db</span>.
        </p>
        {email && (
          <p className="mt-1 text-xs text-zinc-500">Logat ca: {email}</p>
        )}
        {adminsCount != null && (
          <p className="mt-1 text-xs text-zinc-500">
            Admini configurați (ADMIN_EMAILS): {adminsCount}
          </p>
        )}
      </header>

      {!isAdmin && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div>Nu ai acces admin.</div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSwitchAccount()}
            className="mt-2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            Schimbă cont
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isAdmin && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
          <div className="text-sm font-medium text-zinc-900">Admin Tools</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleExportCsv()}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Export CSV (medicines)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleResyncNomenclator}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Resincronizează nomenclator
            </button>
          </div>
          <div className="text-xs text-zinc-500">
            Notă: „Gestionare utilizatori admin” este controlată în acest moment prin
            variabila de mediu <span className="font-medium">ADMIN_EMAILS</span>.
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
          <div className="text-sm font-medium text-zinc-900">SQL utile (Supabase)</div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-700">Șterge duplicări (medicines)</div>
            <pre className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
              {`-- Păstrează primul (cel mai mic id) pe (denumire, concentratie, cantitate_cutie, departament)
WITH d AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY denumire, concentratie, cantitate_cutie, departament
      ORDER BY id
    ) AS rn
  FROM medicines
)
DELETE FROM medicines
WHERE id IN (SELECT id FROM d WHERE rn > 1);
`}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-700">Repară sequence / reset counters</div>
            <pre className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
              {`-- Rulează în Supabase SQL Editor (ajută când apare duplicate key pe insert)
SELECT setval('orders_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM orders), false);
SELECT setval('order_sessions_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM order_sessions), false);
`}
            </pre>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-medium text-zinc-900">1) Alege fișierul DB</div>
        <input
          type="file"
          accept=".db,.sqlite,.sqlite3"
          disabled={!isAdmin || saving}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleChooseFile(f);
          }}
        />
        {fileName && (
          <div className="text-xs text-zinc-600">Fișier: {fileName}</div>
        )}
        <div className="text-xs text-zinc-500">
          Notă: pentru parsare SQLite în browser se folosește sql.js (WASM) încărcat de pe CDN.
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-medium text-zinc-900">2) Preview</div>
        <div className="text-xs text-zinc-600">Total: {rows.length}</div>
        <div className="text-xs text-zinc-600">
          Comenzi (SQLite): {orderSessions.length} sesiuni • {orderItems.length} linii
        </div>
        {rows.length > 0 && (
          <div className="max-h-[40vh] overflow-auto rounded-lg border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Concentrație</th>
                  <th className="px-3 py-2">Cutie</th>
                  <th className="px-3 py-2">Dept</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {preview.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2">{m.id}</td>
                    <td className="px-3 py-2">{m.denumire || "-"}</td>
                    <td className="px-3 py-2">{m.concentratie || "-"}</td>
                    <td className="px-3 py-2">{m.cantitate_cutie || "-"}</td>
                    <td className="px-3 py-2">{m.departament || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-medium text-zinc-900">3) Import</div>
        <button
          type="button"
          disabled={!isAdmin || saving || rows.length === 0}
          onClick={() => void handleImport()}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Se importă..." : "Importă în Supabase"}
        </button>

        {report && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Import finalizat. Noi: {report.inserted}, actualizate: {report.updated}.
          </div>
        )}

        <button
          type="button"
          disabled={!isAdmin || saving || orderSessions.length === 0}
          onClick={() => void handleImportOrders()}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Se importă..." : "Importă comenzi (istoric)"}
        </button>

        {ordersReport && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Import comenzi finalizat. Sesiuni: {ordersReport.sessions}, linii: {ordersReport.lines}.
          </div>
        )}
      </section>
    </div>
  );
}

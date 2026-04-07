import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

type PharmacyCatalogOrderSession = {
  id: number;
  order_number: string | null;
  name: string | null;
  status: string | null;
  created_at: string | null;
  sent_at: string | null;
  closed_at: string | null;
  notes: string | null;
};

type PharmacyCatalogOrderItem = {
  id: number;
  order_session_id: number;
  medicine_id: number;
  qty_ordered: number;
  qty_received: number | null;
  created_at: string | null;
  updated_at: string | null;
};

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function mapSessionStatus(phcStatus: string | null): "ACTIVA" | "FINALIZATA" {
  const s = (phcStatus || "").toUpperCase().trim();
  if (s === "DRAFT" || s === "") return "ACTIVA";
  return "FINALIZATA";
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env lipsă (SERVICE ROLE)." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Neautorizat." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Neautorizat." }, { status: 401 });
  }

  const email = (userData.user.email || "").toLowerCase();
  const admins = getAdminEmails();
  if (!admins.includes(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid." }, { status: 400 });
  }

  const sessionsRaw = Array.isArray(payload?.sessions) ? payload.sessions : [];
  const itemsRaw = Array.isArray(payload?.items) ? payload.items : [];

  const sessions: PharmacyCatalogOrderSession[] = sessionsRaw
    .map((s: any) => ({
      id: Number(s?.id),
      order_number: s?.order_number ?? null,
      name: s?.name ?? null,
      status: s?.status ?? null,
      created_at: s?.created_at ?? null,
      sent_at: s?.sent_at ?? null,
      closed_at: s?.closed_at ?? null,
      notes: s?.notes ?? null,
    }))
    .filter((s: PharmacyCatalogOrderSession) => Number.isFinite(s.id) && s.id > 0);

  const items: PharmacyCatalogOrderItem[] = itemsRaw
    .map((it: any) => ({
      id: Number(it?.id),
      order_session_id: Number(it?.order_session_id),
      medicine_id: Number(it?.medicine_id),
      qty_ordered: Number(it?.qty_ordered ?? 0),
      qty_received: it?.qty_received == null ? null : Number(it.qty_received),
      created_at: it?.created_at ?? null,
      updated_at: it?.updated_at ?? null,
    }))
    .filter(
      (it: PharmacyCatalogOrderItem) =>
        Number.isFinite(it.order_session_id) &&
        it.order_session_id > 0 &&
        Number.isFinite(it.medicine_id) &&
        it.medicine_id > 0
    );

  if (sessions.length === 0) {
    return NextResponse.json({ ok: false, error: "Nu există sesiuni de importat." }, { status: 400 });
  }

  const itemsBySession = new Map<number, PharmacyCatalogOrderItem[]>();
  for (const it of items) {
    const list = itemsBySession.get(it.order_session_id) ?? [];
    list.push(it);
    itemsBySession.set(it.order_session_id, list);
  }

  const service = createClient(supabaseUrl, serviceKey);

  const sessionRows = sessions.map((s) => {
    const list = itemsBySession.get(s.id) ?? [];
    const totalMedicamente = list.length;
    const totalCantitate = list.reduce(
      (acc, x) => acc + (Number.isFinite(x.qty_ordered) ? x.qty_ordered : 0),
      0
    );

    const nume = (s.name || "").trim() || (s.order_number || "").trim() || `Comandă #${s.id}`;
    const descriere = (s.notes || "").trim() || "EMPTY";

    return {
      id: s.id,
      nume_comanda: nume,
      descriere,
      status: mapSessionStatus(s.status),
      created_at: s.created_at ?? undefined,
      total_medicamente: totalMedicamente,
      total_cantitate: totalCantitate,
    };
  });

  for (const part of chunk(sessionRows, 250)) {
    const { error } = await service
      .from("order_sessions")
      .upsert(part, { onConflict: "id" });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Eroare la upsert order_sessions." },
        { status: 500 }
      );
    }
  }

  const sessionIds = sessions.map((s) => s.id);
  for (const part of chunk(sessionIds, 200)) {
    const { error } = await service
      .from("orders")
      .delete()
      .in("order_session_id", part);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Eroare la curățarea liniilor existente (orders)." },
        { status: 500 }
      );
    }
  }

  const ordersToInsert = items
    .filter((it) => sessionIds.includes(it.order_session_id))
    .map((it) => ({
      order_session_id: it.order_session_id,
      medicament_id: it.medicine_id,
      cantitate_comandata: Number.isFinite(it.qty_ordered) ? it.qty_ordered : 0,
    }));

  for (const part of chunk(ordersToInsert, 500)) {
    const { error } = await service.from("orders").insert(part as any);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Eroare la insert orders." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sessionsImported: sessions.length,
    linesImported: ordersToInsert.length,
  });
}

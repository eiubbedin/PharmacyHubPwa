import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

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

  const medicinesRaw = Array.isArray(payload?.medicines) ? payload.medicines : [];
  const medicines: MedicineRow[] = medicinesRaw
    .map((m: any) => ({
      id: Number(m?.id),
      denumire: m?.denumire ?? null,
      concentratie: m?.concentratie ?? null,
      cantitate_cutie: m?.cantitate_cutie ?? null,
      departament: m?.departament ?? null,
      producer: m?.producer ?? null,
      med_type: m?.med_type ?? null,
      stoc: m?.stoc == null ? null : Number(m.stoc),
    }))
    .filter((m: MedicineRow) => Number.isFinite(m.id) && m.id > 0);

  if (medicines.length === 0) {
    return NextResponse.json({ ok: false, error: "Nu există medicamente." }, { status: 400 });
  }

  const service = createClient(supabaseUrl, serviceKey);

  const ids = medicines.map((m) => m.id);
  const idChunks = chunk(ids, 500);
  const existingIds = new Set<number>();

  for (const part of idChunks) {
    const { data, error } = await service
      .from("medicines")
      .select("id")
      .in("id", part);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Eroare la verificarea medicamentelor existente." },
        { status: 500 }
      );
    }

    for (const row of (data as { id: number }[]) || []) {
      existingIds.add(row.id);
    }
  }

  const inserted = medicines.filter((m) => !existingIds.has(m.id)).length;
  const updated = medicines.length - inserted;

  const dataChunks = chunk(medicines, 250);
  for (const part of dataChunks) {
    const { error } = await service
      .from("medicines")
      .upsert(part, { onConflict: "id" });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Eroare la upsert medicines." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, total: medicines.length, inserted, updated });
}

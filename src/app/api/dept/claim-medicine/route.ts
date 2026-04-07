import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env lipsă." },
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

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid." }, { status: 400 });
  }

  const medicineId = Number(payload?.medicine_id);
  if (!Number.isFinite(medicineId) || medicineId <= 0) {
    return NextResponse.json(
      { ok: false, error: "medicine_id invalid." },
      { status: 400 }
    );
  }

  const { data: profRows, error: profErr } = await authClient
    .from("profiles")
    .select("role, department")
    .eq("user_id", userData.user.id)
    .limit(1);

  if (profErr) {
    return NextResponse.json(
      { ok: false, error: "Nu s-a putut citi profilul." },
      { status: 500 }
    );
  }

  const profile = ((profRows as Profile[] | null) ?? [])[0] ?? null;
  if (!profile || profile.role !== "department" || !profile.department) {
    return NextResponse.json(
      { ok: false, error: "Forbidden." },
      { status: 403 }
    );
  }

  const service = createClient(supabaseUrl, serviceKey);

  const { data: med, error: medErr } = await service
    .from("medicines")
    .select("id, departament")
    .eq("id", medicineId)
    .limit(1);

  if (medErr) {
    return NextResponse.json(
      { ok: false, error: "Nu s-a putut citi medicamentul." },
      { status: 500 }
    );
  }

  const currentDep = ((med as { id: number; departament: string | null }[] | null) ?? [])[0]
    ?.departament;

  if (currentDep && currentDep.toUpperCase() === profile.department) {
    return NextResponse.json({ ok: true, updated: false });
  }

  const { error: updErr } = await service
    .from("medicines")
    .update({ departament: profile.department })
    .eq("id", medicineId);

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "Nu s-a putut actualiza departamentul." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, updated: true, department: profile.department });
}

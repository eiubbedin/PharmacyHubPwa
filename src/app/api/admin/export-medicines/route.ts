import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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

export async function GET(req: NextRequest) {
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

  const service = createClient(supabaseUrl, serviceKey);

  const { data, error } = await service
    .from("medicines")
    .select("id, denumire, concentratie, cantitate_cutie, departament, producer, med_type, stoc")
    .order("id", { ascending: true })
    .limit(20000);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Eroare la export medicines." },
      { status: 500 }
    );
  }

  const rows = (data as MedicineRow[]) || [];

  const header = [
    "id",
    "denumire",
    "concentratie",
    "cantitate_cutie",
    "departament",
    "producer",
    "med_type",
    "stoc",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.denumire),
        csvEscape(r.concentratie),
        csvEscape(r.cantitate_cutie),
        csvEscape(r.departament),
        csvEscape(r.producer),
        csvEscape(r.med_type),
        csvEscape(r.stoc),
      ].join(",")
    );
  }

  const csv = `${lines.join("\n")}\n`;
  const fileName = `medicines_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"${fileName}\"`,
    },
  });
}

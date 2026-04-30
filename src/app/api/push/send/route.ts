import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

webpush.setVapidDetails(
  "mailto:admin@pharmhub.ro",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { title, body, url, targetRole } = await req.json();

    // Obține subscriptions pentru userii cu rolul targetRole (default: department)
    const role = targetRole || "department";
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("role", role);

    if (!profiles?.length) return NextResponse.json({ sent: 0 });

    const userIds = profiles.map((p: { user_id: string }) => p.user_id);

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .in("user_id", userIds);

    if (!subs?.length) return NextResponse.json({ sent: 0 });

    const payload = JSON.stringify({ title, body, url: url || "/depozit" });
    let sent = 0;

    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload
          );
          sent++;
        } catch (e) {
          console.warn("Push failed for endpoint", sub.endpoint, e);
        }
      })
    );

    return NextResponse.json({ sent });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { supabase } from "@/lib/supabaseClient";

function formatSupabaseError(err: any): string {
  if (!err) return "";
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : "";
  const details = typeof err.details === "string" ? err.details : "";
  const hint = typeof err.hint === "string" ? err.hint : "";
  return [code, message, details, hint].filter(Boolean).join(" | ");
}

export async function getActiveOrderSessionId(): Promise<number | null> {
  const { data: activeSessions, error } = await supabase
    .from("order_sessions")
    .select("id")
    .eq("status", "ACTIVA")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Eroare la încărcarea comenzii active", error);
    return null;
  }

  const active = (activeSessions as { id: number }[] | null)?.[0] ?? null;
  return active?.id ?? null;
}

export async function getActiveOrderMedicineIds(): Promise<number[]> {
  const activeId = await getActiveOrderSessionId();
  if (!activeId) return [];

  const { data, error } = await supabase
    .from("orders")
    .select("medicament_id")
    .eq("order_session_id", activeId);

  if (error) {
    console.error("Eroare la încărcarea medicamentelor din comanda activă", error);
    return [];
  }

  const rows = (data as { medicament_id: number }[] | null) ?? [];
  const ids = new Set<number>();
  for (const r of rows) {
    if (typeof r?.medicament_id === "number") ids.add(r.medicament_id);
  }
  return Array.from(ids);
}

export async function addOrUpdateMedicineInActiveOrder(params: {
  medicamentId: number;
  qty: number;
  medicineName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medicamentId, qty, medicineName } = params;

  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Cantitate invalidă." };
  }

  const activeId = await getActiveOrderSessionId();
  if (!activeId) {
    return {
      ok: false,
      error:
        "Nu există nicio comandă activă. Creează mai întâi o comandă nouă din tab-ul 'Comandă'.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("id, cantitate_comandata")
    .eq("order_session_id", activeId)
    .eq("medicament_id", medicamentId)
    .limit(1);

  if (existingError) {
    console.error("Eroare la verificarea existenței medicamentului", existingError);
    return {
      ok: false,
      error: `Nu s-a putut verifica medicamentul în comandă. ${formatSupabaseError(
        existingError
      )}`,
    };
  }

  const found = (existing as { id: number; cantitate_comandata: number }[] | null)?.[0] ?? null;

  if (!found) {
    const { error: insertError } = await supabase.from("orders").insert({
      order_session_id: activeId,
      medicament_id: medicamentId,
      cantitate_comandata: qty,
    });

    if (insertError) {
      console.error("Eroare la adăugarea medicamentului în comandă", insertError);
      // If we hit a unique constraint (duplicate row), try to recover by
      // selecting the existing row and updating it.
      const code = typeof (insertError as any).code === "string" ? (insertError as any).code : "";
      if (code === "23505") {
        const { data: again, error: againErr } = await supabase
          .from("orders")
          .select("id, cantitate_comandata")
          .eq("order_session_id", activeId)
          .eq("medicament_id", medicamentId)
          .limit(1);

        if (!againErr) {
          const row = (again as { id: number; cantitate_comandata: number }[] | null)?.[0] ?? null;
          if (row?.id) {
            const { error: updErr } = await supabase
              .from("orders")
              .update({ cantitate_comandata: (row.cantitate_comandata ?? 0) + qty })
              .eq("id", row.id);

            if (!updErr) {
              return { ok: true };
            }

            console.error("Eroare la actualizarea cantității după duplicate", updErr);
            return {
              ok: false,
              error: `Nu s-a putut actualiza cantitatea. ${formatSupabaseError(updErr)}`,
            };
          }
        } else {
          console.error("Eroare la re-verificare după duplicate", againErr);
        }
      }

      return {
        ok: false,
        error: `Nu s-a putut adăuga medicamentul în comandă. ${formatSupabaseError(
          insertError
        )}`,
      };
    }

    return { ok: true };
  }

  const name = medicineName || "medicament";
  const wantsUpdate = window.confirm(
    `Medicamentul "${name}" există deja în comanda activă. Vrei să modifici cantitatea?`
  );

  if (!wantsUpdate) {
    return { ok: true };
  }

  const raw = prompt(
    `Cantitate nouă pentru "${name}" (număr întreg):`,
    String(Math.max(1, (found.cantitate_comandata ?? 0) + qty))
  );

  if (!raw) {
    return { ok: true };
  }

  const newQty = parseInt(raw, 10);
  if (!Number.isFinite(newQty) || newQty <= 0) {
    return { ok: false, error: "Te rog introdu o cantitate validă (număr întreg > 0)." };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ cantitate_comandata: newQty })
    .eq("id", found.id);

  if (updateError) {
    console.error("Eroare la actualizarea cantității", updateError);
    return {
      ok: false,
      error: `Nu s-a putut actualiza cantitatea. ${formatSupabaseError(updateError)}`,
    };
  }

  return { ok: true };
}

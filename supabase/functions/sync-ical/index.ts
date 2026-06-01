import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CONFIGS = [
  { propertyId: "domo",    url: "https://www.airbnb.cl/calendar/ical/907301360932038684.ics?t=0001239a090941ed9c927784535f5559" },
  { propertyId: "refugio", url: "https://www.airbnb.cl/calendar/ical/811690761160204107.ics?t=62f828cad23f47fdaff35039f2af4e6c" },
];

function parseDate(s: string): string {
  const d = s.replace(/T.*/, "").replace(/;.*/, "");
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function getField(block: string, key: string): string {
  const re = new RegExp(`${key}(?:;[^:]+)?:([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[1].replace(/\r?\n[ \t]/g, "").trim();
}

function unescapeIcal(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcal(text: string): Array<{ uid: string; guest: string; checkIn: string; checkOut: string }> {
  const events: Array<{ uid: string; guest: string; checkIn: string; checkOut: string }> = [];
  const blocks = text.split(/BEGIN:VEVENT/i);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const uid = getField(block, "UID");
    const dtstart = getField(block, "DTSTART");
    const dtend = getField(block, "DTEND");
    if (!dtstart || !dtend || !uid) continue;
    const description = unescapeIcal(getField(block, "DESCRIPTION"));
    let guest = "Airbnb";
    const codeMatch = description.match(/\/reservations\/details\/([A-Z0-9]+)/i);
    if (codeMatch) { guest = `Res: ${codeMatch[1]}`; }
    events.push({ uid, guest, checkIn: parseDate(dtstart), checkOut: parseDate(dtend) });
  }
  return events;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  try {
    let configs = DEFAULT_CONFIGS;
    try {
      const body = await req.json();
      if (body && body.configs && body.configs.length) { configs = body.configs; }
    } catch (_e) { /* called without body, use defaults */ }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    let synced = 0;
    const errors: string[] = [];

    for (const { propertyId, url } of configs) {
      let icalText: string;
      try {
        const res = await fetch(url);
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        icalText = await res.text();
      } catch (e) {
        errors.push(`${propertyId}: fetch failed — ${e.message}`);
        continue;
      }

      const events = parseIcal(icalText);
      const activeUids = new Set(events.map((e) => e.uid));

      // Delete cancelled future reservations (no longer in iCal).
      // Never delete past reservations — they are permanent history.
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: dbReservations } = await supabase
        .from("reservas")
        .select("id, ical_uid, check_out")
        .eq("propiedad", propertyId)
        .eq("tipo", "airbnb")
        .not("ical_uid", "is", null)
        .gte("check_out", todayStr);

      for (const dbRes of dbReservations ?? []) {
        if (!activeUids.has(dbRes.ical_uid)) {
          await supabase.from("reservas").delete().eq("id", dbRes.id);
        }
      }

      for (const ev of events) {
        const { data: existing } = await supabase
          .from("reservas")
          .select("id")
          .eq("ical_uid", ev.uid)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("reservas")
            .update({ check_in: ev.checkIn, check_out: ev.checkOut })
            .eq("ical_uid", ev.uid);
          if (!error) { synced++; } else { errors.push(`${propertyId} uid=${ev.uid}: ${error.message}`); }
        } else {
          const { error } = await supabase.from("reservas").insert({
            ical_uid: ev.uid,
            propiedad: propertyId,
            huesped: ev.guest,
            check_in: ev.checkIn,
            check_out: ev.checkOut,
            tipo: "airbnb",
            estado: "airbnb",
            huespedes: null,
            mascotas: false,
            notas: "",
          });
          if (!error) { synced++; } else { errors.push(`${propertyId} uid=${ev.uid}: ${error.message}`); }
        }
      }
    }

    return new Response(JSON.stringify({ synced, errors }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

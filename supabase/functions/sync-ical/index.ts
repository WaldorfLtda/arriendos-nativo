import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const summary = unescapeIcal(getField(block, "SUMMARY"));
    const description = unescapeIcal(getField(block, "DESCRIPTION"));
    let guest = "Airbnb";
    const codeMatch = description.match(/\/reservations\/details\/([A-Z0-9]+)/i);
    if (codeMatch) guest = `Res: ${codeMatch[1]}`;
    events.push({ uid, guest, checkIn: parseDate(dtstart), checkOut: parseDate(dtend) });
  }
  return events;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  try {
    const { configs } = await req.json() as {
      configs: Array<{ propertyId: string; url: string }>;
    };
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        icalText = await res.text();
      } catch (e) {
        errors.push(`${propertyId}: fetch failed — ${e.message}`);
        continue;
      }
      const events = parseIcal(icalText);
      for (const ev of events) {
        const { error } = await supabase.from("reservas").upsert(
          {
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
          },
          { onConflict: "ical_uid", ignoreDuplicates: false }
        );
        if (!error) synced++;
        else errors.push(`${propertyId} uid=${ev.uid}: ${error.message}`);
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

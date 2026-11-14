// Flarmalodebop push sender — Supabase Edge Function "push".
// Triggered by a Database Webhook on INSERT into public.messages.
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, FLARM_WEBHOOK_SECRET
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:flarmalodebop@users.noreply.github.com",
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

Deno.serve(async (req) => {
  const secret = Deno.env.get("FLARM_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-flarm-secret") !== secret) return new Response("forbidden", { status: 403 });

  const payload = await req.json().catch(() => null);
  const m = payload?.record;
  if (!m || payload.type !== "INSERT" || payload.table !== "messages") return new Response("ignored");

  const { data: sender } = await sb.from("profiles").select("display").eq("id", m.sender).single();
  const { data: others } = await sb.from("profiles").select("id").neq("id", m.sender);
  const geese = (String(m.body ?? "").match(/🪿/gu) ?? []).length;
  const body = m.kind === "photo" ? "📷 sent a photo"
    : m.kind === "voice" ? "🎙️ sent a voice note"
    : geese >= 5 ? "🪿 The flock has assembled!"
    : String(m.body).slice(0, 140);

  let sent = 0;
  for (const o of others ?? []) {
    // skip if they have the app open right now (heartbeat in the last 40s)
    const { data: act } = await sb.from("activity").select("active_at").eq("user_id", o.id).maybeSingle();
    if (act && Date.now() - new Date(act.active_at).getTime() < 40_000) continue;
    const { data: subs } = await sb.from("push_subscriptions").select("endpoint, sub").eq("user_id", o.id);
    for (const s of subs ?? []) {
      const sub = s.sub as { endpoint?: string; type?: string };
      // Native tokens live in the same table and are delivered by the expo-push function.
      if (sub?.type === "expo" || !sub?.endpoint) continue;
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ title: sender?.display ?? "Flarmalodebop", body, tag: "flarm-msg" }), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("push failed", code);
      }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

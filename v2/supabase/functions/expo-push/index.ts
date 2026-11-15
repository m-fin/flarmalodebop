// Flarmalodebop native push — Supabase Edge Function "expo-push".
// Triggered by a Database Webhook on INSERT into public.messages.
// No schema change: Expo tokens are rows in public.push_subscriptions
//   endpoint = ExponentPushToken[...]
//   sub      = { "type": "expo", "token": "ExponentPushToken[...]" }
// The web `push` function skips rows whose sub.type is "expo".
//
// Secrets: FLARM_WEBHOOK_SECRET (same header secret as the web function).
// Optional: EXPO_ACCESS_TOKEN (higher Expo push rate limits; not required for two people).
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Turn OFF "Verify JWT" — the webhook authenticates with x-flarm-secret.
// Setup steps: see README.md next to this file and ios-app/TESTFLIGHT.md.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type ExpoSub = { type?: string; token?: string };

Deno.serve(async (req) => {
  const secret = Deno.env.get("FLARM_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-flarm-secret") !== secret) return new Response("forbidden", { status: 403 });

  const payload = await req.json().catch(() => null);
  const message = payload?.record;
  if (!message || payload.type !== "INSERT" || payload.table !== "messages") return new Response("ignored");

  const { data: sender } = await sb.from("profiles").select("display").eq("id", message.sender).single();
  const { data: others } = await sb.from("profiles").select("id").neq("id", message.sender);
  const geese = (String(message.body ?? "").match(/🪿/gu) ?? []).length;
  const body = message.kind === "photo"
    ? "📷 sent a photo"
    : message.kind === "voice"
    ? "🎙️ sent a voice note"
    : geese >= 5
    ? "🪿 The flock has assembled!"
    : String(message.body ?? "").slice(0, 140);

  let sent = 0;
  for (const other of others ?? []) {
    const { data: activity } = await sb.from("activity").select("active_at").eq("user_id", other.id).maybeSingle();
    if (activity && Date.now() - new Date(activity.active_at).getTime() < 40_000) continue;

    const { data: subs } = await sb.from("push_subscriptions").select("endpoint, sub").eq("user_id", other.id);
    const tokens = (subs ?? []).flatMap((row) => {
      const sub = row.sub as ExpoSub;
      if (sub?.type === "expo" && sub.token) return [{ endpoint: row.endpoint as string, token: sub.token }];
      if (typeof row.endpoint === "string" && row.endpoint.startsWith("ExponentPushToken")) {
        return [{ endpoint: row.endpoint, token: row.endpoint }];
      }
      return [];
    });
    if (!tokens.length) continue;

    const access = Deno.env.get("EXPO_ACCESS_TOKEN");
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify(tokens.map((token) => ({
        to: token.token,
        title: sender?.display ?? "Flarmalodebop",
        body,
        sound: "default",
        priority: "high",
        data: { messageId: message.id },
      }))),
    });
    const json = await response.json().catch(() => null) as { data?: { status?: string; message?: string; details?: { error?: string } }[] } | null;
    const tickets = json?.data ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const ticket = tickets[i];
      if (ticket?.status === "ok") sent++;
      else if (ticket?.details?.error === "DeviceNotRegistered") {
        await sb.from("push_subscriptions").delete().eq("endpoint", tokens[i].endpoint);
      } else console.error("expo push failed", ticket?.message ?? response.status);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

# expo-push

Sends an iPhone notification through the [Expo push API](https://docs.expo.dev/push-notifications/sending-notifications/) when a row is inserted into `public.messages`.

No database migration. The app stores tokens in the existing `push_subscriptions` table:

| column | value |
| --- | --- |
| `endpoint` | the Expo push token (`ExponentPushToken[…]`) |
| `user_id` | the signed-in member |
| `sub` | `{ "type": "expo", "token": "ExponentPushToken[…]" }` |

Row Level Security already lets each member read and write only their own rows. The function uses the service role, skips the sender, and skips a recipient whose `heartbeat()` is newer than 40 seconds (the app is open). Web Push rows stay in the same table; `v2/supabase/functions/push/index.ts` ignores `sub.type === "expo"`. Redeploy that function after this one so a native token is not handed to web-push.

## Deploy

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**. Name it **`expo-push`**. Paste `index.ts`. Deploy.
2. Open the function → turn **Verify JWT** / **Enforce JWT verification** **OFF**. The webhook sends `x-flarm-secret` instead of a user JWT.
3. **Edge Functions → Secrets**. `FLARM_WEBHOOK_SECRET` is already set for the web function. Reuse it. Do not create a second secret unless you want a different value, in which case the webhook header must match. `EXPO_ACCESS_TOKEN` is optional.
4. **Database → Webhooks → Create a new hook** (leave the existing `flarm_push` hook in place):
   - **Name:** `flarm_expo_push`
   - **Table:** `public.messages`
   - **Events:** Insert only
   - **Type:** Supabase Edge Functions → function `expo-push`, method POST, timeout 5000 ms
   - **HTTP Headers:** `x-flarm-secret` = the `FLARM_WEBHOOK_SECRET` value
5. On each iPhone, after a TestFlight install: sign in → ⋯ → **Turn on notifications**. That writes the token. A message sent while that phone is backgrounded for more than 40 seconds should arrive as a notification.

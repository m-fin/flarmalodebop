# Flarmalodebop on TestFlight

The iPhone app lives in `ios-app/`. Bundle id `app.flarmalodebop.ios`. It talks to the same private Supabase project as the web app (`https://bpovuwrgvfzdeihpnssv.supabase.co`). Nothing here changes the database schema. Passwords stay out of the repo.

Do this once the Apple Developer Program enrollment for **Matthew Finley** (account type **Individual**) is approved. An Individual account has one Account Holder. That Apple ID is the one EAS will ask for.

## 1. Confirm the Apple account

1. Sign in at [developer.apple.com/account](https://developer.apple.com/account) with the Apple ID that enrolled. The membership page should say **Individual** and **Matthew Finley**, status **Active**.
2. Open [App Store Connect](https://appstoreconnect.apple.com) with the same Apple ID. Accept any new agreements under **Business** (or **Agreements, Tax, and Banking**) before the first upload. Paid apps agreements are not required for a free TestFlight app, but the free app agreement must be accepted.
3. Note the **Team ID** (10 characters) from [developer.apple.com/account](https://developer.apple.com/account) → Membership details. You will paste it if EAS asks.

## 2. Create the App Store Connect record

1. App Store Connect → **Apps** → **+** → **New App**.
2. Platforms: **iOS**. Name: **Flarmalodebop**. Primary language: **English (U.S.)**.
3. Bundle ID: if `app.flarmalodebop.ios` is not in the menu yet, leave this step until after the first `eas build` (EAS can register the identifier). Then come back and create the app. Or register it first under [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **+** → App IDs → App → bundle id `app.flarmalodebop.ios`, enable **Push Notifications**.
4. SKU: `flarmalodebop-ios`. User Access: **Full Access**.
5. Support URL: any HTTPS page you control that loads (the live web app URL is fine). A privacy policy URL is required before an external TestFlight group, not before the Account Holder installs an internal build.

`ios.infoPlist.ITSAppUsesNonExemptEncryption` is already `false` (only standard HTTPS). If App Store Connect still asks about export compliance on the build, answer that the app uses encryption only for HTTPS.

## 3. Expo account

1. Create a free Expo account at [expo.dev/signup](https://expo.dev/signup) if you don’t have one. Keep the project on that personal account so it stays private.
2. On your Mac, in this repo:

```bash
cd ios-app
npm install
npx eas-cli@latest login
npx eas-cli@latest init
```

3. `eas init` creates an EAS project and writes `extra.eas.projectId` into `app.json`. Commit that change. The project id is not a secret; it is what `getExpoPushTokenAsync` uses. Do not put the Apple password, the Supabase service role key, or the member passwords in `app.json`.
4. Optional, so later submits don’t prompt: in `eas.json` under `submit.production.ios`, set `appleTeamId` to the Team ID and `ascAppId` to the numeric Apple ID shown on the app’s App Store Connect page (App Information → Apple ID). Leave them out and the CLI will ask.

## 4. Build and upload

From `ios-app/`, on a machine with the repo (a Mac is not required; EAS builds in the cloud):

```bash
npx eas-cli@latest build -p ios --profile production
```

When EAS asks to log in to Apple, use the Account Holder Apple ID. Let EAS **create and manage** the distribution certificate, provisioning profile, and APNs key. Those credentials stay on Expo’s servers. They are gitignored if a copy lands locally (`*.p8`, `*.p12`, `*.mobileprovision`).

After the build is green:

```bash
npx eas-cli@latest submit -p ios --profile production --latest
```

Or build and submit together:

```bash
npx eas-cli@latest build -p ios --profile production --auto-submit
```

## 5. Install from TestFlight

1. App Store Connect → the app → **TestFlight**. Wait until the build finishes processing (usually a few minutes, sometimes longer).
2. **Internal testing** (no Beta App Review): the Account Holder can install immediately. To add Hailey, **Users and Access** → **+** → invite her Apple ID with a role such as **Marketing** or **Developer** → she accepts → TestFlight → internal group → add her. Internal testers must be App Store Connect users. An Individual team can invite users; it still has only one Account Holder.
3. On each iPhone: install Apple’s **TestFlight** app → open the invite → Install **Flarmalodebop**.
4. First launch: pick 🐸 Frog or 🌸 Hailey, enter the password you already share (it is not in this repo), then ⋯ → **Turn on notifications** → Allow. Push tokens are issued on a real device. The simulator will not register one.

External testing (anyone with a public link, including someone who is not an App Store Connect user) requires a short Beta App Review and a privacy policy URL. Internal testing is the direct path for the two of you.

## 6. Turn on native push

The sender is `v2/supabase/functions/expo-push/`. Full notes are in that folder’s README. Short version:

1. Supabase → **Edge Functions → Via Editor** → name **`expo-push`** → paste `v2/supabase/functions/expo-push/index.ts` → Deploy.
2. Turn **Verify JWT** off for `expo-push`.
3. Reuse the existing **`FLARM_WEBHOOK_SECRET`**. Do not invent a new one unless you also change the header below.
4. Redeploy the web function `push` from `v2/supabase/functions/push/index.ts` so it skips rows with `sub.type === "expo"`. Otherwise the web sender logs an error for each native token (it will not delete them).
5. **Database → Webhooks → Create**:
   - Name: `flarm_expo_push`
   - Table: `public.messages`
   - Events: **Insert**
   - Type: Edge Function `expo-push`, POST, timeout 5000
   - Header: `x-flarm-secret` = `FLARM_WEBHOOK_SECRET`
6. Leave the existing `flarm_push` webhook in place. The web PWA still uses it.
7. No SQL migration. Tokens go in `public.push_subscriptions` (`endpoint` = the Expo token, `sub` = `{ "type": "expo", "token": "…" }`). Existing RLS already confines each member to their own rows.

A notification is sent to the other person when a message is inserted and their app has not called `heartbeat()` in the last 40 seconds. Opening the app clears the badge.

## 7. What you still have to do yourself

- Wait for Apple to approve the Individual enrollment, then accept the App Store Connect agreements.
- Run `eas login`, `eas init`, `eas build -p ios --profile production`, and `eas submit` on a computer where you can enter the Apple ID password and any 2FA code. This agent cannot sign into Apple or Expo for you.
- Create the `expo-push` function and the `flarm_expo_push` webhook in the Supabase dashboard (the service role key never goes in the app).
- Share Hailey’s existing password with her yourself. It is not in git.
- Keep this GitHub repo **private**. `eas init` on a personal Expo account does not publish the source.

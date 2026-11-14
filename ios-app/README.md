# Flarmalodebop for iPhone

Expo SDK 58 app (TypeScript, expo-router) for the same two people as the web app in `v2/`. Sign-in maps `frog` / `hailey` to `frog@flarmalodebop.app` and `hailey@flarmalodebop.app`. Chat uses the private realtime topic `flarm:room` (message changes, presence, typing), `mark_read` / `heartbeat`, and signed URLs for the private `media` bucket.

```bash
cd ios-app
npm install
npx expo start
```

`npx expo start --ios` needs a Mac. Day-to-day UI can also run in Expo’s web preview (`npm run web`). A dev-only `/preview` route renders a fixture thread for screenshots and is not reachable in a release build.

Checks:

```bash
npm test
npm run typecheck
npm run export:ios
```

The publishable Supabase key in `src/lib/config.ts` is the same public key as `v2/public/config.js`. Member passwords are not in the app. The session is stored in the iOS keychain.

Native push tokens are saved on `push_subscriptions` and delivered by `v2/supabase/functions/expo-push`. See that function’s README and `TESTFLIGHT.md` for the webhook and the TestFlight upload once the Apple Developer account is approved.

App name **Flarmalodebop**, bundle id **app.flarmalodebop.ios**. Production build:

```bash
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --profile production --latest
```

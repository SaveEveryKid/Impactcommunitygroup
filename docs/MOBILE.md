# Mobile: today and app-store packaging

## Today: mobile web and installable PWA

The site is built mobile-first and tested in CI on a phone viewport (Pixel 7 profile):

- No horizontal scrolling on any public page (asserted in tests)
- Touch targets of at least 44 × 44 px in navigation
- Safe-area insets (`viewport-fit=cover`, `env(safe-area-inset-*)`) for notched phones
- Native inputs with the right keyboards (`inputMode`, `autocomplete`), labels on every field
- A web app manifest (`/manifest.webmanifest`) with standalone display and maskable icons, so Android Chrome and iOS Safari ("Add to Home Screen") can install it

Not included yet: offline support (a service worker). It was left out deliberately, because caching authenticated pages has privacy risks. Add it only with a reviewed cache strategy.

## Packaging as iOS and Android apps with Capacitor

App-store packaging is **not automatic**. The recommended path keeps one codebase and one backend.

### Approach

Use Capacitor with a **remote URL**: the native shell loads the live site (`server.url`). This reuses server rendering, server actions and auth cookies unchanged. A fully static export isn't possible, because the app relies on server components and server actions.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Kindred Commons" org.yourdomain.app --web-dir public
```

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "org.yourdomain.app",
  appName: "Kindred Commons",
  webDir: "public",
  server: { url: "https://www.yourdomain.org", cleartext: false },
};
export default config;
```

Then `npx cap add ios`, `npx cap add android`, and open in Xcode / Android Studio.

### Platform requirements to plan for

| Area | What's needed |
|---|---|
| **App Store review** | Apple rejects apps that are "just a website" (guideline 4.2). Plan native value before submitting: push notifications, a native share sheet for listings and events, a camera-based QR ticket scanner for check-in, and offline viewing of your own tickets. |
| **Authentication** | Email/password works in the WebView with cookies. Email confirmation and password reset links must reopen the app: configure **Universal Links** (iOS, `apple-app-site-association`) and **App Links** (Android, `assetlinks.json`) served from the domain, and add the app's URL scheme to Supabase Auth redirect URLs. If social login is ever added, Apple requires Sign in with Apple too. |
| **Deep links** | Map `/events/:id`, `/volunteer/:id`, `/resources/:id`, `/transfers/:id`, `/inbox/:id` to open in-app. |
| **Push notifications** | The `push_subscriptions` table already supports `web`, `ios` and `android` tokens. Add `@capacitor/push-notifications`, register tokens on sign-in, and extend the email cron (or a sibling job) to send via APNs/FCM for rows where `notification_preferences.push = true`. |
| **Payments** | Donations to nonprofits and tickets for real-world events are generally allowed to use external payment (Stripe Checkout) instead of in-app purchase. Open Checkout in the system browser (`@capacitor/browser`), not inside the WebView, and confirm current Apple and Google policy at submission time. |
| **Privacy disclosures** | App Store privacy labels and Google Play Data Safety: account info (name, email), user content (messages, posts), coarse location (general area only), purchase history (donations). No tracking or ads. |
| **Accounts** | Apple Developer Program ($99/yr) and Google Play Console ($25 one-time), both in the organization's name. |
| **Minimum versions** | Capacitor 7: iOS 14+, Android 6+ (API 23). |

### Why the current code is ready for this

- No browser-only assumptions in server code; all mutations go through server actions and API routes that native shells can call.
- Auth uses Supabase cookies, which work in WKWebView/Android WebView on the same origin.
- External links use `rel="noopener"`; Stripe and Connect onboarding are full redirects, which Capacitor can route to the system browser.
- Push storage, notification preferences and deduplication are already in the schema.

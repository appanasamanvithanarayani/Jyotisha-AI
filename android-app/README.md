# Jyotisha AI: Android app with AdMob

This is a native Android shell (Capacitor) that opens https://jyotisha.karthiktraders.store full screen and shows a
Google AdMob banner at the bottom. **The server decides whether the banner shows**, so you can switch ads off or on
without releasing a new app version: set `APP_ADS=1` (on) or `0` (off) in the server's `.env` and restart it.

## One-time setup on your Windows PC
1. Install **Android Studio** (it brings the Android SDK and a recent JDK). Open it once so it finishes its downloads.
2. Node.js is already installed. In this folder: `npm install`

## Build the project
```
npm run add-android          # creates the android/ folder (once)
npm run sync                 # copies settings and adds the AdMob app id + location permission
npm run open                 # opens Android Studio
```
In Android Studio let Gradle sync finish. Plug in your phone (USB debugging on) and press **Run** to test with test ads.

## Real ads
1. Create an AdMob account at admob.google.com, add an **Android app**, then create a **Banner** ad unit.
2. Put the app id in when syncing (PowerShell): `$env:ADMOB_APP_ID="ca-app-pub-...~..."; npm run sync`
3. On the server `.env`: `APP_ADS=1` and `ADMOB_BANNER_ID=ca-app-pub-.../...`, then restart.
Until you do this the app shows Google's **test** ads, which is also what you want while testing.
Never click your own live ads.

## Meta Ads install tracking (Facebook SDK)
The native Android app includes Meta App Events Core. With automatic app-event logging enabled it reports the first
activation as an app install and later opens as app launches; the website running inside Capacitor does not need the
Meta browser Pixel for this.

1. In Meta for Developers, add an **Android** platform to your Meta app.
2. Use package name `store.karthiktraders.jyotisha` and add the release key hash printed in the **Build Android app**
   workflow summary. Link the Meta app to the ad account used by the campaign.
3. Copy **App ID** and **Client token** from Meta's app settings into GitHub repository secrets named `META_APP_ID` and
   `META_CLIENT_TOKEN`. The client token is embedded in the APK as required by the SDK; never use an app secret here.
4. Run the workflow and install its new APK/AAB. Existing builds cannot start reporting installs retroactively.
5. In Meta Events Manager / App Ads Helper, open **Test App Events**, uninstall the old app, install the new build, and
   launch it. Confirm an app activation/install and app-launch event appear before using it for campaign optimization.

For a local debug build, set `META_APP_ID` and `META_CLIENT_TOKEN` in the shell before running Gradle. Debug builds are
allowed without them and then log `Meta App Events disabled` in Logcat. Release builds deliberately fail when either
value is absent, preventing a production APK from being published without attribution.

The integration collects the Android advertising ID for ads measurement. Extra SDK screen metadata and product-
improvement collection are explicitly disabled. Keep the Play Console Data safety answers and the public privacy page
up to date when enabling it.

## Release to Google Play

### One-time products

Create these as **one-time products** in Play Console. The IDs must match exactly; prices are configured in Play
Console (the app displays Google's localized price, while the values below are the intended India prices):

| Product ID | Price |
|---|---:|
| `dosha_remedies` | ₹9 |
| `kundli_complete` | ₹19 |
| `ai_questions_5` | ₹9 |
| `ai_action_plan_7d` | ₹9 |
| `rashiphal_forecast_7d` | ₹9 |
| `tarot_detailed` | ₹5 |
| `palm_detailed` | ₹5 |
| `sign_match_full` | ₹3 |
| `partner_portrait` | ₹3 |
| `kundli_match_full` | ₹9 |

Grant the backend service account access to the app in Play Console. On the server set
`JYOTISHA_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to the complete service-account JSON (or mount the file and set
`JYOTISHA_GOOGLE_PLAY_CREDENTIALS` to its path), then switch on **Enable Google Play purchases** in the admin panel.
Never put the service-account JSON in the APK, repository, or a browser-facing setting.

Test with a build installed from an internal testing track and a licence tester account. A sideloaded APK normally
cannot return real product details. Keep each product active before testing.
1. **Build → Generate Signed App Bundle (AAB)**. Create a keystore and keep it somewhere safe and backed up (also never commit it).
2. Upload the `.aab` in Play Console (turn on Play App Signing). The package name `store.karthiktraders.jyotisha` can
   never be changed after you publish, so edit `appId` in `capacitor.config.json` now if you want another one.
3. In Play Console's Data safety form, declare that the app shows ads (Google AdMob) and uses the advertising ID.
4. Once the app is live, link it to your AdMob app so ads can fill.

## Automatic APK updates
You no longer build the APK by hand or commit it to `downloads/`. When anything under `android-app/` changes on
`main`, the **Build Android app** GitHub Action raises the version in `build.gradle` and `downloads/VERSION`
(1.0.8 → 1.0.9 → …), commits that back to `main`, builds a signed APK and publishes it as the latest **GitHub Release**. The server's `/download` page redirects to that release
(`JYOTISHA_APK_RELEASE_REPO`), so visitors always get the newest APK. To rebuild without code changes, open
**Actions → Build Android app → Run workflow**. Website changes never need a new APK: the app loads the live site.

## Daily notifications
The app uses `@capacitor/local-notifications` to schedule a morning notification on the phone (no server, no Firebase):
today's Tithi, Nakshatra and Rahu Kalam, the user's personal line when they have a Kundli, and the festival name on
festival days. The website asks once on Home (Android app only) and the time can be changed in the 🎨 panel. Each time
the app opens it schedules the next 7 mornings plus a reminder to open the app; Android asks for notification permission
once. The small icon is `res/drawable/ic_stat_jyotisha.xml` (set in `capacitor.config.json`).

## Messages from the admin panel (Firebase)
Admin panel → **Notifications** sends a message to every installed app (or only one language) within seconds.
- The app (via `@capacitor-firebase/messaging`) subscribes to the topics `all` and `lang-<code>`; no device list is kept.
- The build adds `google-services.json` from the GitHub secret `GOOGLE_SERVICES_JSON` (never committed).
- The server sends with the Firebase service-account key at `firebase-key.json` in the repo folder on the server,
  mounted read-only into the container (see `deploy/digitalocean/docker-compose.yml`); it is git- and docker-ignored.
  Make it readable by the container user: `sudo chown 10001:10001 firebase-key.json && chmod 600 firebase-key.json`.
Besides the morning Panchang, the app also schedules (each can be switched off in the 🎨 panel):
- **Evening question** (default 7:30 PM): a different curiosity question each day, personal where possible (current dasha,
  Sade Sati); tapping it opens Jyotisha AI and asks the question.
- **Muhurta alerts**: when Abhijit muhurta starts (not on Wednesdays) and when Rahu Kalam starts, between 6 AM and 9:30 PM.

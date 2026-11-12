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

## Release to Google Play
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

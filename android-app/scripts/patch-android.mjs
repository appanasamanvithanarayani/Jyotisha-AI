// Adds what the generated Android project needs: the AdMob app id and the location permissions.
// Usage: ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY node scripts/patch-android.mjs
// With no ADMOB_APP_ID, Google's public TEST app id is used, which only shows test ads.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const appId = (process.env.ADMOB_APP_ID || TEST_APP_ID).trim();
if (!/^ca-app-pub-\d{16}~\d{10}$/.test(appId)) throw new Error('ADMOB_APP_ID must look like ca-app-pub-1234567890123456~1234567890');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.env.MANIFEST_PATH || join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!existsSync(manifestPath)) throw new Error(`Run "npm run add-android" first; ${manifestPath} does not exist.`);

let xml = readFileSync(manifestPath, 'utf8');
const permissions = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.INTERNET'];
for (const name of permissions) {
  if (!xml.includes(`android:name="${name}"`)) xml = xml.replace(/<\/manifest>/, `    <uses-permission android:name="${name}" />\n</manifest>`);
}
const meta = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${appId}" />`;
if (xml.includes('com.google.android.gms.ads.APPLICATION_ID')) {
  xml = xml.replace(/(<meta-data[^>]*com\.google\.android\.gms\.ads\.APPLICATION_ID[^>]*android:value=")[^"]*(")/, `$1${appId}$2`);
} else {
  xml = xml.replace(/<\/application>/, `        ${meta}\n    </application>`);
}
writeFileSync(manifestPath, xml);
console.log(`Patched ${manifestPath} (AdMob app id ${appId === TEST_APP_ID ? 'TEST' : 'yours'}).`);

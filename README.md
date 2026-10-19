# DEADLINE

A lightweight, dark-mode deadline countdown app. No accounts, ads, analytics, payments, or preloaded records.

## Features
- Multiple deadlines with a title and local date/time.
- Accurate `HH:MM:SS` countdowns calculated from each absolute deadline timestamp.
- Local-device persistence; no account or network needed for normal use.
- Clear ended state at `00:00:00`, plus urgency colors for approaching deadlines.
- Optional scheduled local notification at each deadline on supported Android devices.
- Responsive web/PWA interface and a Capacitor Android wrapper.

## Run locally
Requires Node.js 22 or newer.

```sh
npm install
npm test
npm run build
npm run android:sync
```

To create the Android project locally:
```sh
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Android APK
GitHub Actions runs on pushes to `main` and can be started manually from **Actions → Build Android APK → Run workflow**. On success, download the `deadline-debug-apk` artifact from that run. It is a debug APK for personal testing, not a signed Play Store release.

## Notifications and Android limits
Use **Enable alerts** in the app to request permission and schedule notifications for future deadlines. Android 13+ requires notification permission, and exact delivery can depend on Android alarm permission, battery policy, device settings, and OEM behavior. This first version schedules deadline-time alerts; it does **not** run a foreground service or provide a permanently pinned, continuously updating countdown notification. Verify notification delivery on the target Android device.

## Data and privacy
Deadline records live in this browser/app's local storage. Clearing app storage/browser data removes them. No backend or account is used. Do not rely on this app as the only reminder for critical events.

## Tests
`npm test` covers time formatting and urgency thresholds. CI runs tests before building the web assets and APK.

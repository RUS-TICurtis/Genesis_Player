# Genesis Player Quick Start

## Browser Development

Run the local app and backend together:

```bash
npm install
npm run dev
```

Open `http://localhost:1552`.

## Android Build

The Android project already exists in `android/`, so you do not need to add it again.

Use this flow:

```bash
npm install
npm run cap:doctor
npm run cap:sync:android
npm run cap:open:android
```

Then in Android Studio:

1. Wait for Gradle sync
2. Pick an emulator or device
3. Press Run

## What Works Right Away

- UI and navigation
- bundled web assets
- native Android packaging
- local library features that do not depend on the Express API

## What Still Needs Backend Access

The frontend currently calls relative endpoints like `/api/...`, so Android builds will need a reachable backend for features such as online discovery, lyrics, and related API-driven data.

If you want full mobile online features, the next step is adding a mobile API base URL and pointing it at a deployed backend.

## Useful Commands

```bash
npm run dev
npm run start
npm run cap:copy:android
npm run cap:sync:android
npm run cap:open:android
npm run cap:doctor
```

# Genesis Player Android Build Guide

This repo already has Capacitor wired in for Android:

- `capacitor.config.json` exists
- `android/` already exists
- the app id is `com.genesis.player`
- web assets are synced into the native project with Capacitor

The main thing that was missing was the npm scripts and declared Capacitor dependencies in `package.json`.

## What Changed

These scripts are now available:

```bash
npm run cap:copy
npm run cap:copy:android
npm run cap:sync
npm run cap:sync:android
npm run cap:open:android
npm run cap:doctor
```

## Before You Build

Install these on your machine:

- Node.js 24.x
- Android Studio
- JDK 17 or newer
- Android SDK / emulator from Android Studio

Then install project dependencies:

```bash
npm install
```

## How Android Building Works Here

This project has two layers:

1. The web app
   - `public/` contains the HTML/CSS bundle Capacitor copies into Android
   - `js/` contains the frontend logic the app loads in the WebView

2. The backend
   - `backend/` is a separate Express API
   - the frontend currently calls relative endpoints like `/api/deezer/trending`

That second point matters on Android:

- In a browser on `http://localhost:1552`, the web app and backend are served together, so `/api/...` works.
- In a Capacitor Android app, the frontend runs from the bundled app assets, not from your local Express server.
- That means the mobile app will not reach your local backend unless you explicitly point it to a reachable hosted API or a LAN-accessible dev server.
- This repo now defaults mobile and non-local builds to `https://genesis-player.vercel.app`.

## Normal Android Workflow

### 1. Sync the web app into Android

Run this after frontend changes:

```bash
npm run cap:sync:android
```

This copies the current web assets into `android/app/src/main/assets/public`.

### 2. Open Android Studio

```bash
npm run cap:open:android
```

### 3. Build and run

Inside Android Studio:

1. Wait for Gradle sync to finish
2. Choose an emulator or connected device
3. Press Run

## When To Use Each Script

- `npm run start`
  - runs the local Express server for browser testing
- `npm run dev`
  - local auto-reload development server
- `npm run cap:copy:android`
  - copies web assets only
- `npm run cap:sync:android`
  - copies web assets and syncs native plugin changes
- `npm run cap:open:android`
  - opens the Android project in Android Studio
- `npm run cap:doctor`
  - checks your Capacitor setup

In practice, `cap:sync:android` is the one you will use most.

## Important Limitation Right Now

The app currently uses relative API paths such as:

- `/api/deezer/trending`
- `/api/deezer/search`
- `/api/lyrics`

So for Android builds:

- local library features can work in the WebView
- backend-powered features need the backend to be reachable from the device

If you want Android builds to use the online features outside your local machine, the next step is to add a real frontend API base URL configuration and point mobile traffic at a deployed backend.

That config now lives in `js/api-config.js`.

- Localhost browser dev uses same-origin `/api`
- Capacitor / file-based runs default to `https://genesis-player.vercel.app`
- You can override it later through `window.GENESIS_API_BASE_URL` or the stored `genesis_api_base_url`

## Practical Testing Options

### Option 1: UI-only Android test

If you only want to verify layout, navigation, local library flows, and native packaging:

1. `npm run cap:sync:android`
2. `npm run cap:open:android`
3. Run the app in Android Studio

Some online data may fail until the backend is reachable.

### Option 2: Full-feature Android test

1. Deploy the backend somewhere reachable
2. Add a frontend API base URL strategy for mobile
3. Sync again with `npm run cap:sync:android`
4. Rebuild in Android Studio

## Typical Command Sequence

For day-to-day Android work:

```bash
npm install
npm run cap:doctor
npm run cap:sync:android
npm run cap:open:android
```

After later frontend changes:

```bash
npm run cap:sync:android
```

## Troubleshooting

### Android app shows old UI

Run:

```bash
npm run cap:sync:android
```

Then rebuild from Android Studio.

### Gradle sync fails

Check:

- Android Studio SDK install
- JDK version
- internet access for Gradle dependencies

Then try Android Studio's Gradle sync again.

### Online features fail on Android

That usually means the bundled app cannot reach the Express backend. This is expected until the frontend is given a mobile-safe API base URL and the backend is hosted somewhere reachable.

## Files To Know

- `package.json`
- `capacitor.config.json`
- `android/`
- `public/index.html`
- `js/`
- `backend/`

## Recommended Next Step

If you want, the next useful improvement is to add a small frontend API config module so:

- browser dev keeps using same-origin `/api`
- Android can use a deployed backend URL
- you can switch environments without hand-editing fetch calls everywhere

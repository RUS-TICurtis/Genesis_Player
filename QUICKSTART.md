# Genesis Player - Quick Start Guide

## ✅ What's Been Set Up

Your Genesis Player is now configured with **Capacitor** to run as a native Android/iOS mobile app! Here's what's ready:

### 🎯 Completed Setup

1. ✅ **Capacitor Installed** - Core, Android, iOS platforms
2. ✅ **Plugins Added** - App, Filesystem, SplashScreen, StatusBar
3. ✅ **Android Project Created** - Ready to build in Android Studio
4. ✅ **API Configuration** - Smart routing for web/mobile environments
5. ✅ **Mobile Optimizations** - Back button handling, app lifecycle management
6. ✅ **Build Scripts** - npm commands for easy syncing

### 📁 New Files Created

- `capacitor.config.json` - Capacitor configuration
- `public/js/config.js` - API endpoint configuration
- `public/js/capacitor-init.js` - Mobile plugin initialization
- `CAPACITOR_README.md` - Detailed documentation
- `.gitignore` - Git ignore rules
- `android/` - Native Android project folder

## 🚀 Next Steps

### Option 1: Test in Browser (Easiest)

```bash
npm start
```

Visit http://localhost:1552 - Everything works as before!

### Option 2: Build Android APK

#### Prerequisites
- Install [Android Studio](https://developer.android.com/studio)
- Install Java JDK 17 or higher

#### Steps

1. **Open Android Studio**
   ```bash
   npm run cap:open:android
   ```

2. **Wait for Gradle Sync** (first time takes 5-10 minutes)

3. **Run on Emulator or Device**
   - Click the green "Run" button (▶️)
   - Or press `Shift + F10`

### Option 3: Build for Production

Before building for production, you need to:

1. **Deploy Your Backend**
   - Deploy `backend/` folder to Vercel, Railway, or Heroku
   - Get the production URL (e.g., `https://your-app.vercel.app`)

2. **Update API Configuration**
   
   Edit `public/js/config.js`:
   ```javascript
   export const API_CONFIG = {
       baseURL: '',
       productionURL: 'https://your-backend-url.com', // ← Add your URL here
       // ...
   };
   ```

3. **Sync Changes**
   ```bash
   npm run cap:sync
   ```

4. **Build in Android Studio**
   - Build → Generate Signed Bundle / APK
   - Follow the wizard to create a keystore
   - Choose "release" build variant

## 📱 Features That Work on Mobile

✅ **Local Music Playback** - Play audio files from device storage  
✅ **Metadata Extraction** - Read ID3 tags from music files  
✅ **Playlists** - Create and manage playlists (stored in IndexedDB)  
✅ **Favorites** - Mark tracks as favorites  
✅ **Queue Management** - Manage playback queue  
✅ **Search** - Search your local library  
✅ **Theme Toggle** - Light/dark mode  
✅ **Back Button** - Native Android back button support  
✅ **App Lifecycle** - Proper pause/resume handling  

⚠️ **Requires Backend** (when deployed):
- Discover Tab - Fetch music from Jamendo, LastFM, etc.
- Lyrics - Fetch lyrics from Genius API
- Genre Detection - Get genre info from LastFM

## 🛠️ Useful Commands

```bash
# Sync web changes to mobile
npm run cap:sync

# Open Android Studio
npm run cap:open:android

# Sync only Android
npx cap sync android

# Add iOS platform (macOS only)
npx cap add ios

# Open Xcode (macOS only)
npx cap open ios
```

## 🐛 Troubleshooting

### "Module not found" errors
```bash
npx cap sync android
```

### White screen on app launch
1. Open Chrome and go to `chrome://inspect`
2. Find your device and click "inspect"
3. Check console for errors

### Gradle build errors
1. In Android Studio: File → Invalidate Caches / Restart
2. Clean and rebuild

### API calls not working in mobile app
- Make sure you've set `productionURL` in `public/js/config.js`
- Verify your backend is deployed and accessible

## 📖 More Information

See `CAPACITOR_README.md` for detailed documentation on:
- Building for production
- iOS setup
- Plugin usage
- Advanced configuration

## 🎉 You're All Set!

Your app is ready to run on Android! Just open Android Studio and hit run.

**Need help?** Check the detailed README or the Capacitor docs at https://capacitorjs.com

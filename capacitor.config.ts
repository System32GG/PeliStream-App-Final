import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pelisstream.app',
  appName: 'PelisStream',
  webDir: 'public',
  server: {
    // Standalone APK mode: no external server needed.
    // The app uses browser-side scraping (scraper.js) via Capacitor's native WebView.
    // To connect to a local Windows server instead, uncomment and set your PC's IP:
    // url: 'http://192.168.1.X:3000',
    // cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#06060f',
    },
  },
};

export default config;

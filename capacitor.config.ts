import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'pl.btcsygnaly.app',
  appName: 'BTC Sygnały',
  webDir: 'dist',
  // Dane pobieramy przez CapacitorHttp, więc nie obowiązuje nas CORS WebView.
  plugins: {
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#F7931A',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: true,
    },
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#000000',
    contentInset: 'never',
  },
}

export default config

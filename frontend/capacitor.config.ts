import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.com.dinder.app',
  appName: 'Heykeen',
  webDir: 'dist',
  // Native bridge logging includes plugin arguments, including credentials.
  loggingBehavior: 'none',
  // Bundle the interface. No remote server.url or permissive allowNavigation.
  server: { androidScheme: 'https' },
  ios: { contentInset: 'never', webContentsDebuggingEnabled: false },
  android: { webContentsDebuggingEnabled: false, allowMixedContent: false },
};

export default config;

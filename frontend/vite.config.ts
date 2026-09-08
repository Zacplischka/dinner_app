import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const native = env.VITE_NATIVE_BUILD === 'true';
  const origins = [env.VITE_BACKEND_URL, env.VITE_API_BASE_URL, env.VITE_SUPABASE_URL]
    .filter(Boolean).map((value) => new URL(value).origin);
  const connections = Array.from(new Set([...origins, ...origins.map((origin) => origin.replace(/^http/, 'ws'))])).join(' ');
  return {
  plugins: [react(), ...(native ? [{
    name: 'native-content-policy',
    transformIndexHtml: () => [{ tag: 'meta', attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' ${connections}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`,
    }, injectTo: 'head-prepend' as const }],
  }] : [])],
  server: {
    port: 3000,
    allowedHosts: ['host.docker.internal', 'localhost'],
  },
  build: {
    outDir: 'dist',
    sourcemap: native ? 'hidden' : true,
    rollupOptions: {
      output: {
        // One long-cached vendor chunk: react + router change only on a dependency
        // bump, so a deploy that touches app code no longer re-downloads them.
        // Rollup's object form pulls each package's dependencies in with it.
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
};
});

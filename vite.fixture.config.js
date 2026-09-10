// Dev-only config: runs the app against fixtures/ instead of Supabase, so
// UI states can be checked at every viewport without reading or writing
// production data. `npm run build` uses vite.config.js and never sees this.
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  resolve: {
    alias: [
      { find: /^@\/lib\/platform$/, replacement: path.resolve(__dirname, './fixtures/nativePlatformFixture.js') },
      { find: /^@\/lib\/revenuecat$/, replacement: path.resolve(__dirname, './fixtures/nativePurchaseFixture.js') },
      { find: /^@\/api\/base44Client$/, replacement: path.resolve(__dirname, './fixtures/base44Fixture.js') },
      { find: /^@\/api\/supabaseClient$/, replacement: path.resolve(__dirname, './fixtures/supabaseFixture.js') },
      { find: /^\.\/supabaseClient$/, replacement: path.resolve(__dirname, './fixtures/supabaseFixture.js') },
      { find: /^@\/api\/entities$/, replacement: path.resolve(__dirname, './fixtures/entitiesFixture.js') },
      { find: /^\.\/entities$/, replacement: path.resolve(__dirname, './fixtures/entitiesFixture.js') },
      { find: /^@\/lib\/AuthContext$/, replacement: path.resolve(__dirname, './fixtures/authFixture.jsx') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  plugins: [react()],
});

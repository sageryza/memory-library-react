import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // A human-readable build stamp (UTC) surfaced in the UI so it's obvious which
  // version is actually loaded — useful for telling "deployed" from "cached".
  define: {
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(5, 16).replace('T', ' ') + ' UTC'
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Membry',
        short_name: 'Membry',
        description: 'Your memory library',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Drop stale precaches when a new service worker activates, so updates
        // don't get stuck behind old cached assets.
        cleanupOutdatedCaches: true,
        // XI's illustrated decks bundle ~1.3 MB of inline card art into their
        // own lazy-loaded chunk; raise the precache limit so it can be cached.
        maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.map': 'empty'
      }
    }
  }
})

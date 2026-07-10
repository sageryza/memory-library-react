import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // A human-readable build stamp (Pacific time, 12-hour) surfaced in the UI so
  // it's obvious which version is actually loaded — useful for telling
  // "deployed" from "cached".
  define: {
    __BUILD_ID__: JSON.stringify(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: '2-digit', day: '2-digit',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }).replace(',', '') + ' PT'
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually (deferred) in main.jsx: on a first visit over a
      // weak connection, the service worker's ~2MB precache download was
      // competing with the page's own code for bandwidth — the app is
      // interactive first, THEN the offline copy downloads.
      injectRegister: false,
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
        // XI card art (public/xi-cards/*.webp) is intentionally NOT precached —
        // it's cached on demand via runtimeCaching below, so the SW install stays
        // small and the first paint isn't gated on downloading every card.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Drop stale precaches when a new service worker activates, so updates
        // don't get stuck behind old cached assets.
        cleanupOutdatedCaches: true,
        // Page opens go to the NETWORK first: a fresh visit always gets the
        // newest deploy (the HTML is ~1.4KB), and the cached copy is only the
        // fallback when offline or the network stalls past 3s. Without this,
        // the service worker served the stored app shell first, so people kept
        // seeing versions from before the latest deploy until it updated in
        // the background — stale-cache bug reports during rapid iteration.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] }
            }
          },
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
          },
          {
            // Cache each XI card the first time it's shown, then serve it
            // instantly (and offline) thereafter.
            urlPattern: /\/xi-cards\/.*\.webp$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'xi-card-art',
              expiration: {
                maxEntries: 400,
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
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big, rarely-changing third-party code (Firebase, React) into
        // their own chunks. The app deploys often; isolating vendor code means a
        // deploy only invalidates the small app chunk, so returning visitors keep
        // ~330KB of vendor cached instead of re-downloading it every time.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
})

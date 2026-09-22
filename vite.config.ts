import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [VitePWA({
    registerType: 'autoUpdate', injectRegister: null,
    includeAssets: [],
    manifest: {
      name: '梦想小镇 · 河畔新生活', short_name: '梦想小镇',
      description: '一座由你慢慢经营的河畔小镇',
      theme_color: '#315e49', background_color: '#e9e5ce',
      display: 'standalone', orientation: 'any',
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    },
    workbox: {
      navigateFallbackDenylist: [/\/asset-preview\.html$/],
      // world.png is legacy art that no code loads; keeping it out of the offline payload
      // saves every player 2.5 MB. verify-offline.mjs proves an ignored file is unreferenced,
      // so this cannot silently start excluding something the game actually needs.
      globIgnores: ['**/favicon.svg', '**/assets/world.png', '**/assets/expansion-2026-09/**', '**/assets/accessories-2026-09/**', '**/assets/readiness-2026-09/**', '**/assets/crops-growing*'],
      // Optional art/audio is cached after first use, not downloaded by every player.
      runtimeCaching: [{
        urlPattern: /\/assets\/(?:expansion|accessories|readiness)-2026-09\//,
        handler: 'CacheFirst',
        options: { cacheName: 'optional-town-assets-v1', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 256, maxAgeSeconds: 60 * 60 * 24 * 90 } }
      }],
      globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,webp,svg,woff2,json,wav}'],
      dontCacheBustURLsMatching: /assets\/.*-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/,
      maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
    }
  })],
  build: { chunkSizeWarningLimit: 1600, rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } }
});

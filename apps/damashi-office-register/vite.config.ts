import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    process.env.VITEST ? undefined : VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "黛玛诗办公楼合同发票登记",
        short_name: "办公楼登记",
        description: "黛玛诗办公楼合同、发票、付款与结算登记（试用）",
        lang: "zh-CN",
        display: "standalone",
        start_url: "./",
        scope: "./",
        background_color: "#f3efe6",
        theme_color: "#1f3a34",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/login/, /^\/robots\.txt$/],
      },
      devOptions: { enabled: true },
    }),
  ].filter((plugin) => plugin != null),
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: 상대 경로라 GitHub Pages 하위 경로(/NineMensMorris/) 게시에서도 그대로 동작.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 서비스 워커 등록은 src/ui/PwaStatus.tsx 의 useRegisterSW 훅에서 단일 처리.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: "나인 멘스 모리스 — Nine Men's Morris",
        short_name: '나인 멘스 모리스',
        description: '난이도별 AI 솔로 플레이 + 온라인 멀티플레이. 설치하면 작업표시줄에서 바로 실행됩니다.',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        categories: ['games'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 사전계산 테이블이 없어 bin 프리캐시는 불필요(요트다이스와 다른 점).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
      // dev 에서는 SW 비활성(캐싱 혼선 방지). 오프라인 테스트는 build + preview 로.
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
});

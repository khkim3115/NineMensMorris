import { defineConfig } from 'vite';

// 트레이 앱(desktop/popup.html)은 루트 웹 빌드에 의존하지 않는다.
// src/core + src/engine 을 IIFE 한 파일(window.NMM)로 묶어 desktop/vendor 에 커밋한다.
// → 규칙·AI 의 단일 진실원본을 웹과 트레이가 공유(요트다이스처럼 로직을 두 벌 쓰지 않음).
export default defineConfig({
  // outDir 가 desktop/vendor 라 public/ 을 복사하면 아이콘이 섞여 들어간다 — 끈다.
  publicDir: false,
  build: {
    lib: {
      entry: 'src/engine/trayEntry.ts',
      name: 'NMM',
      formats: ['iife'],
      fileName: () => 'nmm-engine.js',
    },
    outDir: 'desktop/vendor',
    emptyOutDir: false,
    minify: 'esbuild',
    target: 'es2022',
  },
});

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

나인 멘스 모리스(Nine Men's Morris) 웹 게임 — **난이도별 탐색 AI 솔로 플레이**, 온라인 멀티플레이, Electron 트레이 앱.
React 19 + Vite + TypeScript 프런트엔드, Supabase(Postgres + Realtime) 서버권위 멀티플레이, `desktop/` 에 별도 Electron 트레이 앱.
코드 주석은 한국어로 쓴다.

## Commands

```bash
npm install
npm run dev              # vite dev server → http://localhost:5173 (PWA/서비스워커 꺼짐)
npm test                 # vitest run — 순수 로직(규칙·AI 강도 회귀)
npm run test:watch
npm run typecheck        # tsc --noEmit
npm run build            # tsc --noEmit + vite build → dist/
npm run preview          # 빌드 결과 서빙 — PWA 설치/오프라인은 dev 가 아니라 여기서 확인
npm run build:tray-engine  # src/core+engine → desktop/vendor/nmm-engine.js (IIFE, 커밋 대상)
npm run generate-pwa-assets
```

단일 테스트: `npx vitest run src/core/gameState.test.ts` (`-t "<이름>"` 으로 한 케이스만).

트레이 앱(완전 독립 — 자체 `package.json`/`node_modules`, 루트 웹 빌드에 의존하지 않음):
```bash
cd desktop && npm install && npm start   # Electron 트레이 앱 실행
cd desktop && npm run dist               # 설치 파일 → desktop/release/
```

## 절대 깨뜨리면 안 되는 것

- **`src/core/board.ts` 의 24 지점 인덱스 순서는 동결 계약이다.** UI 좌표, AI, 서버(plpgsql) 검증,
  저장된 국면, 트레이 번들이 전부 이 인덱싱을 공유한다. 재배열하면 아무 에러 없이 다른 게임이 된다.
  `board.test.ts` 가 위상 불변식(32변·16밀·차수 분포·밀이 실제 직선인지)을 지킨다.
- **규칙 코드는 `applyMoveInPlace` 한 곳에만 있다.** 불변 버전 `applyMove` 는 `cloneState` 후 이를 호출하고,
  엔진은 `applyMoveInPlace`/`undoMove` 로 같은 함수를 쓴다. 규칙을 두 벌로 만들지 말 것.
- **`src/core`·`src/engine` 을 고쳤으면 `npm run build:tray-engine` 을 돌려 번들을 다시 커밋한다.**
  안 그러면 웹과 트레이 앱의 규칙·AI 가 어긋난다.
- **밀 완성 후 상대 말 제거는 별도의 ply(`mustRemove`) 다** — 차례는 유지된다. UI 2클릭 흐름, 서버 RPC,
  탐색이 모두 이 표현을 공유한다. 탐색은 자식의 `turn` 이 바뀔 때만 부호를 뒤집는다.

## Layering

```
src/core/      순수 규칙 (UI·네트워크 무관, 테스트 1급 대상)
  board.ts       ADJACENCY(32변) · MILLS(16줄) · POINT_XY · MILLS_BY_POINT — 동결 위상
  rules.ts       RuleConfig 단일 진실원본 (말 9개 · 플라잉 3 · 반복 3회 · 50수)
  gameState.ts   legalMoves · applyMoveInPlace/undoMove · applyMove · 종료 판정
  zobrist.ts     국면 해시 (반복 무승부 + 엔진 전치표 공용)
  testkit.ts     테스트 전용 국면 빌더(24글자 보드 문자열)
src/engine/    AI (UI 무관)
src/store/     Zustand 스토어 + 훅 — 엔진과 UI 사이의 유일한 상태 접착제
src/ui/        React 컴포넌트 (표현 전담, 상태는 스토어에서)
src/lib/       Supabase 클라이언트 + 채팅·피드백 API
```

`core` 와 `engine` 에는 React/DOM import 가 없고 `node` 환경 vitest 로 단위 테스트한다(`src/**/*.test.ts`).

## 표준 룰 (v1 고정)

말 9개씩. **배치** → (양쪽 다 놓으면) **이동**(인접 빈칸) → 말이 3개가 되면 **플라잉**(아무 빈칸).
가로·세로 3목(**밀**)을 만들면 상대 말 1개 제거 — 단 **밀에 속한 말은 제거 불가**(상대 말이 전부 밀일 때만 예외).
말이 2개가 되거나 움직일 수 없으면 패배. 같은 국면 3회 반복 또는 말 제거 없이 50수면 무승부.
변형 룰(라스커 모리스 등)은 넣지 않는다 — `RuleConfig` 는 확장 여지로만 남겨둔 값이다.

## Contributing & releases

`CONTRIBUTING.md` 참고. 트렁크 기반: 이슈 1개 → `<type>/<이슈>-<슬러그>` 브랜치 → PR(`Closes #n`) → **squash merge**
(`main` push 마다 자동 배포). 배포와 *공지*는 분리 — 공지는 `src/data/changelog.ts` 맨 위에 항목을 추가하면서
웹 버전을 올리고 `web-vX.Y.Z` 태그를 단다. 트레이 버전은 `desktop/package.json` 에서 독립적으로 `tray-vX.Y.Z`.

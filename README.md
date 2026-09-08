# ⚫ 나인 멘스 모리스 (Nine Men's Morris)

웹에서 즐기는 **나인 멘스 모리스**. **혼자 하기**(쉬움·보통·어려움 AI 대결),
**온라인 멀티플레이**(방 코드로 1:1 대전), **트레이 앱**(작업표시줄 상주)을 지원합니다.

🔗 **라이브 데모**: <https://khkim3115.github.io/NineMensMorris/>

React 19 + Vite + TypeScript. AI 는 **알파베타 가지치기 + 반복심화 + 전치표** 기반 탐색 엔진이고,
멀티플레이는 **Supabase(Postgres + Realtime)** 가 규칙까지 검증하는 서버 권위 구조입니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

빌드 / 미리보기 / 테스트:

```bash
npm run build      # 타입체크 + vite build → dist/
npm run preview    # PWA 설치·오프라인은 dev 가 아니라 여기서 확인
npm test           # vitest — 규칙 계약 + AI 강도 회귀
```

## 게임 규칙

말 9개씩. **배치 → 이동 → 플라잉** 3단계로 진행합니다.

| 단계 | 내용 |
|---|---|
| 배치 | 번갈아 빈 지점에 말을 하나씩 놓습니다(각 9개). |
| 이동 | 다 놓으면 선으로 이어진 **인접한 빈 지점**으로만 옮깁니다. |
| 플라잉 | 내 말이 **3개**만 남으면 아무 빈 지점으로 날아갈 수 있습니다. |

가로·세로로 내 말 3개를 한 줄에 모으면 **밀(mill)** 이 완성되고, **상대 말 1개를 뗍니다.**
단 **밀에 속한 상대 말은 뗄 수 없습니다** — 상대 말이 전부 밀에 들어가 있을 때만 예외입니다.
두 줄을 동시에 완성해도 떼는 건 하나입니다.

- **승리**: 상대 말이 2개로 줄거나, 상대가 움직일 수 없게 되면 이깁니다.
- **무승부**: 같은 국면이 3번 반복되거나, 말을 하나도 못 뗀 채 50수가 지나면 비깁니다.

> 게임 화면 우측 상단 **❓ 도움말**에 규칙·조작이 정리돼 있고, 처음 방문 시 한 번 자동으로 열립니다.
> **🌙/☀️** 테마, **📋** 패치노트, **💬** 익명 피드백도 같은 줄에 있습니다.

## 🤖 난이도별 AI

| 난이도 | 탐색 | 성격 |
|---|---|---|
| 쉬움 | 한 수 앞 + 큰 잡음, 25% 확률로 실수 | 밀을 자주 놓칩니다. 규칙을 익히는 용도. |
| 보통 | 네 수 앞 알파베타, 단순 평가 | 밀과 말 수는 챙기지만 이중 위협(포크)은 놓칩니다. |
| 어려움 | 시간 예산(1.5초)까지 반복심화 + 전치표 | 이중 위협·봉쇄·이동성까지 계산하고, 같은 국면이면 항상 같은 수를 둡니다. |

평가 지표는 문헌에서 쓰는 고전 특징값 — **밀 수 · 재료(말 수) · 열린 2줄 · 포크 · 봉쇄된 상대 말 · 이동성** —
이며 배치/이동/플라잉 페이즈마다 가중치가 다릅니다([`src/engine/evaluate.ts`](src/engine/evaluate.ts)).

**선후공**은 홈과 ⚙️ 설정에서 고릅니다 — **흑**(내가 먼저) · **백**(AI 가 먼저) · **랜덤**(판마다 추첨).
흑이 언제나 선공이라 색과 선후공은 같은 축입니다. 랜덤은 새 판을 시작할 때마다 다시 뽑고,
이번 판에 뽑힌 색은 차례 배너(`나 (백) 차례`)와 결과 화면에서 확인할 수 있습니다.
바꾼 선택은 **다음 판부터** 적용됩니다 — 판 도중에 좌석이 바뀌면 되돌리기·힌트가 어긋나기 때문입니다.

**💡 힌트** 버튼은 난이도와 무관하게 어려움 수준으로 읽어 지금 국면의 최선수를 보드에 표시합니다.

탐색은 **Web Worker** 에서 돌아 UI 가 멈추지 않습니다([`src/engine/aiClient.ts`](src/engine/aiClient.ts)).

## 🌐 온라인 멀티플레이 (방 + 초대코드)

홈에서 **방을 만들고 초대코드**를 알려주면 친구와 **1:1 턴제 대전**을 할 수 있습니다(방 안 채팅 포함).
정적 프론트엔드(GitHub Pages)는 **게임 권위를 갖지 않습니다** — 인접·밀·제거 예외·승패·무승부 판정을
전부 Supabase 가 `SECURITY DEFINER` RPC 안에서 검증하고, 클라이언트 직접 쓰기는 RLS 로 막습니다.

- 선공(흑)은 시작할 때 **무작위**로 정해집니다.
- 상대가 2분 넘게 두지 않으면 **시간초과 승리**를 주장할 수 있습니다.
- 스키마·RLS·RPC 의 진실원본은 [`supabase/schema.sql`](supabase/schema.sql) 입니다.
  객체 이름이 전부 `nmm_` 로 시작하는 이유는 **요트다이스와 Supabase 프로젝트를 공유**하기 때문입니다
  (그래서 이 파일에는 전역 `revoke` 를 절대 넣지 않습니다).

### 환경변수 (둘 다 공개용 — anon 키는 RLS 로 보호됨)

로컬은 `.env.local`(gitignore 처리됨)에:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

> `service_role` 키는 **절대** 넣지 마세요. 값이 없으면 혼자 하기는 정상 동작하고 멀티 UI 만 비활성화됩니다.
> GitHub Pages 빌드는 **repo Variables**(Settings → Secrets and variables → Actions → Variables)에서 읽습니다.

### 규칙 일치 검증

서버(plpgsql)와 클라이언트(`src/core`)가 같은 규칙을 쓰는지 실제 한 판을 두며 확인합니다.

```bash
npm run build:tray-engine        # 최신 규칙을 번들에 반영
node scripts/mp-e2e.mjs          # 독립 익명 세션 2개로 대국 → 매 수 보드·차례·손패 대조 + 승패 사유 비교
```

## 🖥️ 앱으로 즐기기

- **PWA 설치** — 주소창의 설치(⊕) 아이콘이나 화면의 **⬇ 앱 설치** 버튼. 설치하면 주소창 없는 독립 창으로
  뜨고, 서비스워커가 앱을 캐싱해 **혼자 하기는 인터넷 없이도** 동작합니다(AI 연산이 전부 브라우저 안에서 일어납니다).
- **트레이 앱 (Windows·macOS)** — 시스템 트레이/메뉴 막대에 상주하는 Electron 미니 앱.
  빌드·배포·단축키는 [`desktop/README.md`](desktop/README.md) 참고.
  규칙과 AI 는 **웹과 같은 코드**(`src/core`+`src/engine` 을 묶은 `desktop/vendor/nmm-engine.js`)를 씁니다.

아이콘을 바꾸려면 [`public/icon.svg`](public/icon.svg) 를 수정한 뒤 `npm run generate-pwa-assets` 를 돌립니다.

## 구조

```
src/
  core/        순수 규칙 (UI·네트워크 무관, 테스트 1급 대상)
    board.ts       24 지점 위상 — 인접 32변 · 밀 16줄 · SVG 좌표 (동결 계약)
    rules.ts       RuleConfig 단일 진실원본
    gameState.ts   합법 수 · 착수 적용/되돌리기 · 승패·무승부 판정
    zobrist.ts     국면 해시 (반복 판정 + 전치표 공용)
    view.ts        보드 클릭 의미·하이라이트·상태 문구 (웹과 트레이 공용)
  engine/      AI (UI 무관)
    evaluate.ts    페이즈별 평가함수
    search.ts      negamax + 알파베타 + 반복심화 + 전치표 + 무브 오더링
    ai.ts          공개 API — chooseMove(난이도) / bestMove(힌트)
    ai.worker.ts   Web Worker 래퍼, aiClient.ts 창구
    trayEntry.ts   트레이 번들(IIFE) 진입점
  store/       Zustand — appStore(화면) · gameStore(솔로) · multiplayerStore(서버 권위)
  ui/          React — Board · TurnBanner · Home · App · Lobby · MultiplayerGame · 모달들
  lib/         Supabase 클라이언트 + 채팅·피드백
supabase/schema.sql   멀티플레이 스키마·RLS·RPC (nmm_ 접두)
scripts/mp-e2e.mjs    서버↔클라이언트 규칙 일치 통합 점검
desktop/              Electron 트레이 앱
```

## 검증 (sanity checks)

- **위상 불변식** — 인접 32변·대칭성, 밀 16줄, 모든 지점이 정확히 2개 밀에 속함, 각 밀이 실제 직선인지.
- **규칙 계약** — 밀 제거 예외(상대가 전부 밀일 때만 아무거나), 두 밀 동시 완성도 1개만 제거,
  3개 남으면 플라잉, 이동 불가 패배, 반복·50수 무승부, undo 완전 복원, 증분 해시 = 전체 재계산.
- **AI 강도 회귀** — 선후공을 번갈아 실제 대국을 돌려 **승점 비율**(승 1·무 0.5)을 확인합니다:
  어려움 vs 보통 ≥ 70%, 보통 vs 쉬움 ≥ 70%, 어려움 vs 쉬움 ≥ 90%.
  전술 테스트로 *한 수 승리 찾기*·*밀 저지*·*플라잉으로 급소 막기*·*결정론*도 함께 봅니다.

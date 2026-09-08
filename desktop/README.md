# 나인 멘스 모리스 — 트레이 미니 앱 (Electron, Windows·macOS)

시스템 트레이(윈도우 우하단 알림 영역 / macOS 메뉴 막대)에 **상주**하는 가벼운 Electron 앱.
트레이 아이콘을 누르면 작은 네이티브 메뉴가 뜨고, **혼자 하기**를 고르면 트레이 위에 작은 팝업이 떠서
난이도별 AI 와 한 판 두고, **온라인 대전**을 고르면 같은 팝업이 로비로 바뀝니다(웹과 동일한 Supabase 백엔드).

## 규칙과 AI 는 웹과 **같은 코드**를 쓴다

요트다이스 트레이 앱은 게임 로직을 바닐라 JS 로 다시 구현했지만, 이 앱은 그러지 않습니다.
`src/core`(규칙) + `src/engine`(AI) 를 IIFE 한 파일로 묶은 [`vendor/nmm-engine.js`](vendor/nmm-engine.js) 를
[`renderer.js`](renderer.js) 가 `window.NMM` 으로 불러 씁니다 — **규칙과 AI 의 단일 진실원본**입니다.

```bash
# 루트에서 — src/core·src/engine 을 고쳤다면 반드시 다시 만들어 커밋할 것
npm run build:tray-engine     # → desktop/vendor/nmm-engine.js (약 14KB)
```

멀티플레이는 동봉한 [`vendor/supabase.js`](vendor/supabase.js)(supabase-js UMD)로 웹과 같은
`nmm_*` RPC·Realtime 채널을 호출합니다. 루트 웹 빌드(`../dist`)에는 의존하지 않습니다.

## 개발 실행

```bash
cd desktop
npm install
npm start        # electron . — 트레이 아이콘 표시(클릭 → 메뉴 → 플레이)
```

### 자동 점검(스모크)

창을 실제로 띄워 **엔진 로드 → 보드 24지점 렌더 → 사람 착수 → AI 응수 → 힌트 → 테마 왕복 →
온라인 화면 전환 → Esc 숨김**까지 DOM 으로 확인하고 종료합니다.

착수 검사 전에 **선후공을 흑으로 고정**하고 새 판을 엽니다 — 저장된 선택이 백·랜덤이면 실행마다
다른 게임이 되어 조용히 엉뚱한 값을 보고하게 됩니다. 끝나면 원래 선택을 되돌립니다(`seat` 필드로 확인).

```bash
cd desktop
NMM_SMOKE=1 NMM_SMOKE_OUT=smoke.json NMM_SMOKE_SHOT=shot.png npx electron .
cat smoke.json      # 모든 값이 참/양수여야 정상
```

> 앱이 이미 떠 있으면 단일 인스턴스 잠금에 걸려 아무 출력 없이 즉시 종료됩니다.
> 그럴 땐 앱을 끄거나 `--user-data-dir=<임시경로>` 를 붙여 격리해서 돌리세요.

## 설치 파일 만들기

```bash
cd desktop
npm install
npm run dist
```

→ `desktop/release/NineMensMorris-Tray-Setup.exe` (`package.json` 의 `build.nsis.artifactName` 으로
이름 고정). 실행하면 설치되고 시작 메뉴·바탕화면 바로가기가 생기며, 처음 실행 시 **부팅 자동 실행이 켜집니다**
(메뉴에서 끄고 켤 수 있음).

> **배포(GitHub Releases)** — 웹 홈의 *앱으로 받기 → 트레이 앱* 버튼은 고정 자산
> `releases/latest/download/NineMensMorris-Tray-Setup.exe` 를 가리킵니다.
>
> **자동 빌드** — GitHub 에서 **릴리스를 publish 하면**(태그 `tray-vX.Y.Z`)
> [`desktop-release.yml`](../.github/workflows/desktop-release.yml) 이 Windows 설치 파일과
> 자동 업데이트 메타데이터(`latest.yml` + `.blockmap`), macOS `.dmg` 를 빌드해 그 릴리스에 첨부합니다.
>
> `--publish never` 인 이유: 업로드는 `gh` 스텝이 전담합니다. electron-builder 가 직접 publish 하면
> 기본 태그 규약(`v${version}`)으로 별도 릴리스를 만들어 이 저장소의 `tray-vX.Y.Z` 태그와 충돌합니다.

## macOS (.dmg) — 무료(미서명) 배포

같은 코드로 macOS `.dmg` 도 빌드합니다. 플랫폼 차이(모두 `process.platform` 분기, `main.js`):

- **자동 업데이트 없음** — electron-updater 는 코드 서명+공증이 필요한데 무료 배포라 둘 다 없습니다.
  새 버전은 웹 홈의 macOS 다운로드 카드에서 `.dmg` 를 다시 받습니다.
- **Dock 아이콘 숨김**(`app.dock.hide()`) — 메뉴 막대 전용 디스크리트 앱.
- **스크린세이버 레벨 alwaysOnTop** — 전체화면 앱 위에도 뜨도록.
- **로그인 시 자동 실행**(`openAsHidden`).

> **⚠️ 첫 실행(Gatekeeper)** — Apple Developer 계정 없이 배포하므로 정식 서명·공증이 불가합니다.
> 대신 [`scripts/adhoc-sign.cjs`](scripts/adhoc-sign.cjs)(electron-builder `afterPack` 훅)가
> **ad-hoc 서명**(`codesign -s -`)을 적용합니다 — 이게 있어야 **설정 ▸ 개인정보 보호 및 보안 ▸
> "무시하고 열기"** 로 첫 실행을 허용할 수 있습니다. 더 확실한 우회는
> `xattr -dr com.apple.quarantine "/Applications/Nine Mens Morris.app"`.

## 트레이 메뉴 / 조작

- 트레이 아이콘 **좌클릭/우클릭** = 작은 네이티브 메뉴
- **혼자 하기** — 트레이 위 작은 팝업에서 AI 와 오프라인 대국
- **온라인 대전** — 같은 팝업이 로비로 전환(방 만들기/참가 → 실시간 대전 + 채팅)
- **자동 실행 / 라이트 모드 / 위치 고정 / 위치 초기화 / 업데이트 확인 / 종료**

### 키보드 단축키 (팝업 포커스 상태)

| 키 | 동작 |
|---|---|
| `Esc` | 팝업 닫기(숨김 — 상태는 유지) |
| `1` `2` `3` | 난이도 쉬움 / 보통 / 어려움 |
| `S` | 내 색 흑 → 백 → 랜덤 (헤더의 색 칩과 같은 동작) |
| `H` | 힌트(최선수 표시) |
| `Z` | 되돌리기(내 마지막 차례로) |
| `R` · 결과 화면의 `Enter` | 새 게임 |
| `` ` `` (백틱) | (온라인) 채팅 패널 접기/펼치기 |

## 동작 메모

- **선후공** — 헤더의 색 칩(`S`)이 흑 → 백 → 랜덤을 순환합니다. 칩의 **점은 이번 판 내 색**,
  **글자는 고른 값**이라 랜덤일 때 뽑힌 색이 그대로 보입니다. 빈 판이면 곧바로 새 판으로 반영하고,
  두던 중이면 다음 판으로 미루면서 칩에 강조 테두리(`.chip.on`)를 켭니다 — `R` 로 새 판을 열면 적용됩니다.
  선택은 렌더러 `localStorage` 의 `nmm_seat` 에 저장되고(난이도 `nmm_diff` 와 같은 방식), 웹과 값 형식이 같습니다.
- 팝업 크기 — 혼자 하기 300×424 / 온라인 300×444, 채팅을 펼치면 폭 470.
- **팝업 바깥 클릭(포커스 상실) → 자동 숨김**. 창은 파괴되지 않아 실시간 구독이 유지되고,
  다시 열면 최신 상태가 보입니다. 트레이 메뉴 **위치 고정**을 켜면 바깥 클릭에도 숨지 않습니다.
- 팝업 **헤더를 끌어** 옮길 수 있고 그 위치를 기억합니다(작업 영역 안으로 클램프).
  **위치 초기화**로 트레이 우하단 기본 위치로 되돌립니다.
- 완전 종료는 메뉴 **종료**로만(✕/Esc 는 숨김).
- 렌더러는 `contextIsolation` + CSP(`script-src 'self'`) 아래에서 돌고, 창 제어는 preload 가 노출한
  `window.tray` 로만 합니다(엔진 전역 `window.NMM` 과 이름을 분리).

## 빌드 문제 해결 (Windows)

`npm run dist` 중 `winCodeSign` 압축 해제가 **심볼릭 링크 권한** 때문에 실패할 수 있습니다.
해결(택1): **개발자 모드 켜기**(설정 ▸ 개인 정보 및 보안 ▸ 개발자용) / 관리자 권한 터미널에서 실행 /
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` 아래 임시 폴더를 `winCodeSign-2.6.0` 로 복사 후 재빌드.

설치 파일은 코드 서명이 없어 첫 실행 시 SmartScreen 경고가 뜰 수 있습니다(추가 정보 ▸ 실행).

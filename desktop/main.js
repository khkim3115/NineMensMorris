// 나인 멘스 모리스 트레이 미니 앱 (Electron, Windows·macOS)
// - 트레이 상주. 트레이 클릭 → 작은 네이티브 메뉴. '혼자 하기'를 누르면 트레이 위에 작은 팝업이 떠서
//   그 안에서 AI 와 한 판 둔다. '온라인 대전'은 같은 팝업이 로비로 바뀐다(자립형 popup.html).
// - 게임 규칙과 AI 는 vendor/nmm-engine.js(웹과 같은 src/core+engine 번들)를 그대로 쓴다.
// - 바깥 클릭 시 팝업 숨김. 부팅 시 자동 실행(첫 실행 기본 ON). 혼자 하기는 완전 오프라인.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

const POPUP = path.join(__dirname, 'popup.html');
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, 'build', 'icon.png');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// 작은 팝업. 보드가 정사각이라 폭·높이가 함께 필요하다. 온라인에서 채팅을 펼치면 옆으로만 넓어진다.
const SOLO_W = 300;
const SOLO_H = 424;
const MP_W = 300;
const MP_W_WIDE = 470; // 백틱으로 우측 채팅을 펼쳤을 때
const MP_H = 444; // 로비/대전은 코드·상대 정보를 위해 살짝 더 높게

// 창 배경색 — 표시/리사이즈 순간의 깜빡임을 줄이려 테마에 맞춘다(light 값 = popup 의 라이트 --bg).
const BG = { dark: '#07090f', light: '#f4f4f5' };
const themeOf = (s) => (s.theme === 'light' ? 'light' : 'dark');

// 창 투명도(불투명도) — 30~100 정수(%). 30% 바닥값은 창이 완전히 사라져 잃어버리는 것을 방지.
// 슬라이더·setOpacity·저장값이 모두 이 클램프를 단일 출처로 공유한다.
const OPACITY_MIN = 30;
const opacityOf = (s) => {
  const v = Number.isFinite(s.opacity) ? Math.round(s.opacity) : 100;
  return Math.max(OPACITY_MIN, Math.min(100, v));
};

let tray = null;
let win = null;
let shownAt = 0; // 표시 직후 즉시 blur(깜빡임) 무시
let panelMode = 'solo'; // 'solo' | 'mp' — 트레이 메뉴가 결정, 렌더러에 전달
let sideOpen = false; // 온라인 대전에서 채팅이 펼쳐져 있는지(폭 결정)
let pinned = false; // 위치 고정(핀) — true 면 바깥 클릭(blur)에도 창을 숨기지 않는다. settings.pinned 미러.
let suppressMoveSave = false; // positionPanel 의 프로그램 이동을 'moved' 저장에서 제외(자기 이동을 사용자 이동으로 오인 방지).
// 자동 업데이트 상태 — 메모리 전용(settings.json 영속화 안 함). 트레이 메뉴 라벨이 이 값을 읽는다.
// 진행 표시(휘발성)와 "설치 가능"(영속 사실)을 분리한다 — 주기 재확인의 진행 이벤트가
// 이미 받아둔 설치본 표시를 덮어써 사라지게 하는 회귀를 막기 위함.
let updateState = 'idle'; // 'idle' | 'checking' | 'downloading' — 다운로드 완료 전의 진행 표시
let updateReady = false; // 다운로드 완료 → 설치 가능(진행 이벤트가 이 사실을 덮지 못함)
let pendingUpdateVersion = null; // 설치 가능한 신버전(설치 항목 라벨용)
let updateCheckTimer = null; // 1시간 재확인 인터벌 핸들(다운로드 완료 시 정리)
let autoUpdaterActive = false; // setupAutoUpdater 가 실제 활성화됐는지(개발 모드 no-op 검증 지점)
app.isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());

  // 렌더러(✕/Esc)의 숨기기 요청 — 닫지 않고 hide만(상태 유지, blur 와 동일).
  ipcMain.on('nmm-hide', () => {
    if (win && !win.isDestroyed()) win.hide();
  });

  // 온라인 대전에서 백틱으로 채팅을 펼치거나 접을 때 — 창 폭만 조절(우하단 앵커 유지).
  ipcMain.on('nmm-side', (_e, show) => {
    sideOpen = !!show;
    if (panelMode === 'mp' && win && !win.isDestroyed()) positionPanel();
  });

  // 렌더러의 ☀️/🌙 토글 — 테마를 settings.json 에 저장하고 창 배경색·트레이 메뉴를 갱신.
  ipcMain.on('nmm-set-theme', (_e, mode) => {
    const theme = mode === 'light' ? 'light' : 'dark';
    const s = readSettings();
    s.theme = theme;
    writeSettings(s);
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(BG[theme]);
      // 메인(settings.json)이 단일 출처 — 저장한 값을 다시 렌더러로 돌려보내 화면을 갱신한다.
      win.webContents.send('nmm-theme', theme);
    }
    rebuildTrayMenu();
  });

  // 렌더러 투명도 슬라이더 — 30~100으로 클램프해 즉시 적용. 드래그 중(persist=false)엔 적용만,
  // 드래그 끝(persist=true)에만 settings.json 저장(디스크 난타 방지).
  ipcMain.on('nmm-set-opacity', (_e, payload) => {
    const value = opacityOf({ opacity: payload && payload.value });
    if (win && !win.isDestroyed()) win.setOpacity(value / 100);
    if (payload && payload.persist) {
      const s = readSettings();
      s.opacity = value;
      writeSettings(s);
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.khkim.ninemensmorris');
    if (process.platform === 'darwin' && app.dock) app.dock.hide(); // 메뉴 막대 전용(독 아이콘 숨김) — 디스크리트
    pinned = readSettings().pinned === true; // 저장된 핀 상태 복원(blur 핸들러가 이 미러를 읽는다)
    setupAutostartDefault();
    createTray();
    createWindow(); // 미리 로드(빠른 첫 오픈), 메뉴에서 띄운다.
    setupAutoUpdater(); // 설치본에서만 동작(개발 모드는 no-op)
  });

  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: SOLO_W,
    height: SOLO_H,
    show: false,
    frame: false,
    resizable: false,
    movable: true, // 헤더(popup.html .top)의 -webkit-app-region:drag 로 창을 끌어 옮길 수 있게 한다.
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: BG[themeOf(readSettings())],
    icon: ICON_PATH,
    title: "Nine Men's Morris",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  // macOS: 전체화면 앱 위에도 뜨도록 더 높은 레벨로(스크린세이버). Windows 는 기본 alwaysOnTop 로 충분.
  if (process.platform === 'darwin') win.setAlwaysOnTop(true, 'screen-saver');
  win.setOpacity(opacityOf(readSettings()) / 100); // 저장된 투명도 복원
  win.loadFile(POPUP);

  win.webContents.on('did-finish-load', () => {
    console.log('[nmm] loaded:', win.webContents.getURL());
    win.webContents.send('nmm-theme', themeOf(readSettings())); // 메인(settings.json)이 단일 출처 — 렌더러에 푸시
    win.webContents.send('nmm-opacity', opacityOf(readSettings())); // 슬라이더 초기값 복원
    if (process.env.NMM_SMOKE) runSmoke();
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[nmm] load failed:', code, desc, url);
  });

  // 스모크 점검 중에는 렌더러 콘솔을 그대로 흘려 보내 원인을 바로 본다.
  if (process.env.NMM_SMOKE) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`);
    });
  }

  // 팝업 바깥 클릭(포커스 상실) → 숨김. 단, 위치 고정(핀) 모드면 숨기지 않는다(딴 작업하며 띄워두기).
  win.on('blur', () => {
    if (pinned) return;
    if (win.webContents.isDevToolsOpened()) return;
    if (Date.now() - shownAt < 300) return;
    win.hide();
  });

  // 사용자가 헤더를 끌어 창을 옮기면 그 위치를 기억(다음 표시 때 같은 자리에 복원).
  // positionPanel 이 setBounds 로 옮긴 경우(suppressMoveSave)는 저장하지 않는다 — 자기 이동을 사용자 이동으로 오인 방지.
  win.on('moved', () => {
    if (suppressMoveSave) return;
    const b = win.getBounds();
    const s = readSettings();
    s.winPos = { x: b.x, y: b.y };
    writeSettings(s);
    rebuildTrayMenu(); // '위치 초기화' 항목 활성화 갱신
  });

  // 닫기(✕ / Alt+F4) = 트레이로 숨김.
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// 현재 모드(+상대 패널 펼침 여부)에 따른 팝업 크기.
function panelDims() {
  if (panelMode !== 'mp') return { width: SOLO_W, height: SOLO_H };
  return { width: sideOpen ? MP_W_WIDE : MP_W, height: MP_H };
}

// 팝업 위치 결정 — 사용자가 옮겨둔 위치(winPos)가 있으면 그 자리에 복원, 없으면 트레이 우하단(기본).
// 크기는 항상 현재 모드(panelDims)에 맞춘다. 저장 위치는 그 지점이 속한 디스플레이의 작업영역 안으로 클램프해
// 모니터 분리·해상도 변경으로 화면 밖에 놓여 잃어버리는 것을 막는다.
function positionPanel() {
  const dims = panelDims();
  const width = dims.width;
  const saved = readSettings().winPos;
  let x, y, height;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const area = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y }).workArea;
    height = Math.min(dims.height, area.height - 16);
    x = Math.min(Math.max(saved.x, area.x + 8), area.x + area.width - width - 8);
    y = Math.min(Math.max(saved.y, area.y + 8), area.y + area.height - height - 8);
  } else {
    const tb = tray.getBounds();
    const area = screen.getDisplayMatching(tb).workArea;
    height = Math.min(dims.height, area.height - 16);
    x = Math.round(tb.x + tb.width / 2 - width / 2);
    x = Math.min(x, area.x + area.width - width - 8);
    x = Math.max(x, area.x + 8);
    y = area.y + area.height - height - 8;
  }
  // setBounds 가 유발하는 'moved' 는 사용자 이동이 아니므로 저장에서 제외(다음 매크로태스크에 해제).
  suppressMoveSave = true;
  win.setBounds({ x, y, width, height });
  setTimeout(() => { suppressMoveSave = false; }, 0);
}

function showPanel(mode = 'solo') {
  if (!win || win.isDestroyed()) {
    createWindow();
    win.once('ready-to-show', () => showPanel(mode));
    return;
  }
  panelMode = mode === 'mp' ? 'mp' : 'solo';
  if (panelMode !== 'mp') sideOpen = false; // 혼자 하기로 돌아오면 폭 초기화
  positionPanel();
  win.show();
  win.focus();
  shownAt = Date.now();
  win.webContents.send('nmm-mode', panelMode); // 렌더러가 화면(solo/mp-lobby) 전환
}

// ── 트레이(좌/우클릭 모두 작은 네이티브 메뉴) ──
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('나인 멘스 모리스');
  tray.on('click', () => tray.popUpContextMenu());
  rebuildTrayMenu();
}

// 트레이 메뉴 템플릿(평면 배열). Electron 의존 값(자동실행·테마·업데이트 상태)을 인자로 받아 메뉴 구성과
// 분리한다 — 상태를 주입해 항목 집합을 따로 점검할 수 있다. update 에 따라 업데이트 항목 집합이 달라진다.
function buildTrayTemplate({ autoOn, isLight, pinned, hasCustomPos, update }) {
  const items = [
    { label: '나인 멘스 모리스', enabled: false },
    { type: 'separator' },
    { label: '혼자 하기', click: () => showPanel('solo') },
    { label: '온라인 대전', click: () => showPanel('mp') },
    { type: 'separator' },
    {
      label: process.platform === 'darwin' ? '로그인 시 자동 실행' : 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: autoOn,
      click: (item) => setAutostart(item.checked),
    },
    {
      label: '라이트 모드',
      type: 'checkbox',
      checked: isLight,
      click: (item) => {
        const theme = item.checked ? 'light' : 'dark';
        const s = readSettings();
        s.theme = theme;
        writeSettings(s);
        if (win && !win.isDestroyed()) {
          win.setBackgroundColor(BG[theme]);
          win.webContents.send('nmm-theme', theme); // 숨겨져 있어도 다음 표시 때 이미 반영
        }
        rebuildTrayMenu(); // 체크 상태 갱신
      },
    },
    {
      label: '위치 고정',
      type: 'checkbox',
      checked: pinned,
      click: (item) => setPinned(item.checked),
    },
    {
      label: '위치 초기화',
      enabled: hasCustomPos, // 옮긴 적이 있을 때만 활성(트레이 우하단 기본 위치로 복귀)
      click: () => resetPanelPosition(),
    },
    { type: 'separator' },
  ];
  // 자동 업데이트 항목은 설치본에서만(update.enabled) 노출 — 개발 모드에선 동작하지 않으므로 통째로 숨긴다.
  if (update.enabled) {
    // 다운로드가 끝나 설치 가능하면(ready) "설치" 항목(클릭 → 재시작·설치). 발견·다운로드만으론 절대 재시작 안 함.
    // ready 는 영속 사실이라 주기 재확인의 진행/오류 이벤트가 이 항목을 가리거나 지우지 못한다.
    if (update.ready) {
      items.push({
        label: `📥 업데이트 ${update.version ? 'v' + update.version + ' ' : ''}설치`,
        // 설치가 시작되면 electron-updater 가 app.quit() → 'before-quit' 가 isQuitting 을 세팅해 창이 정상 종료된다.
        // 동기 사전실패(설치 파일 없음 등)면 quit 이 안 일어나니, isQuitting 을 미리 만지지 않아야 ✕=숨김이 유지된다.
        click: () => autoUpdater.quitAndInstall(),
      });
    }
    // "지금 업데이트 확인" — 아직 받지 않았을 때만 활성. 이미 받았으면(ready) 비활성. 진행 상태는 라벨로 피드백.
    items.push({
      label:
        update.state === 'checking'
          ? '🔄 업데이트 확인 중…'
          : update.state === 'downloading'
            ? '⬇️ 업데이트 다운로드 중…'
            : '🔄 지금 업데이트 확인',
      enabled: !update.ready && update.state === 'idle',
      click: () => checkForUpdates(),
    });
    items.push({ type: 'separator' });
  }
  items.push({
    label: '종료',
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });
  return items;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const template = buildTrayTemplate({
    autoOn: app.getLoginItemSettings().openAtLogin,
    isLight: themeOf(readSettings()) === 'light',
    pinned,
    hasCustomPos: !!readSettings().winPos,
    // 설치본에서만 업데이트 항목 노출. app.isPackaged 는 실행 내내 불변이라 init 순서와 무관(=autoUpdaterActive 보다 안전).
    // 자동 업데이트 항목은 Windows 설치본에서만(mac 은 서명·공증 없어 electron-updater 비활성).
    update: { enabled: app.isPackaged && process.platform === 'win32', state: updateState, ready: updateReady, version: pendingUpdateVersion },
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// 위치 고정(핀) 토글 — settings.pinned 에 저장하고 미러를 갱신(blur 핸들러가 즉시 반영).
function setPinned(on) {
  pinned = !!on;
  const s = readSettings();
  s.pinned = pinned;
  writeSettings(s);
  rebuildTrayMenu();
}

// 위치 초기화 — 저장된 winPos 를 지워 트레이 우하단 기본 배치로 되돌린다(옮긴 창을 잃었을 때의 탈출구).
function resetPanelPosition() {
  const s = readSettings();
  delete s.winPos;
  writeSettings(s);
  if (win && !win.isDestroyed() && win.isVisible()) positionPanel(); // 보이는 중이면 즉시 기본 위치로
  rebuildTrayMenu(); // '위치 초기화' 비활성화 갱신
}

// ── 자동 업데이트(electron-updater + GitHub Release) ──
// 백그라운드로 자동 다운로드한 뒤, 트레이 메뉴의 "설치"를 사용자가 누를 때만 재시작·설치한다.
// (온라인 대전 중 자동 재시작으로 방 상태가 유실되는 것을 막기 위해 autoInstallOnAppQuit=false.)
function setupAutoUpdater() {
  if (!app.isPackaged) return; // app.isPackaged 가 false 면 비활성(개발 포함) — 설치본에서만 동작
  // macOS 는 코드서명+공증 없이는 electron-updater 가 동작하지 않는다($99 미사용) → 비활성.
  // mac 신버전은 수동 .dmg 재다운로드(웹 홈 다운로드 카드)로 안내한다.
  if (process.platform !== 'win32') return;
  autoUpdaterActive = true;
  autoUpdater.autoDownload = true; // 발견 즉시 백그라운드 다운로드
  autoUpdater.autoInstallOnAppQuit = false; // 설치는 사용자가 "설치"를 누를 때만
  // ⚠️ allowPrerelease 는 반드시 false 로 유지할 것. true 면 GitHubProvider 가 릴리스 태그를
  //    semver.valid() 로 거르는데, 이 저장소 태그(tray-vX.Y.Z)는 invalid 로 판정돼 전부 건너뛴다.
  //    false 경로는 /releases/latest 의 tag_name 을 그대로 쓰고 버전은 latest.yml 에서 읽는다.
  autoUpdater.allowPrerelease = false;

  // 진행 표시 이벤트(checking/available/not-available/error)는 아직 받지 않았을 때만 의미가 있다.
  // 이미 ready 면 무시 — 그래야 (받아둔 뒤의) 재확인 이벤트가 설치 항목을 가리거나 지우지 않는다.
  autoUpdater.on('checking-for-update', () => {
    if (updateReady) return;
    updateState = 'checking';
    rebuildTrayMenu();
  });
  autoUpdater.on('update-available', () => {
    if (updateReady) return;
    updateState = 'downloading'; // autoDownload 가 곧바로 받기 시작
    rebuildTrayMenu();
  });
  autoUpdater.on('update-not-available', () => {
    if (updateReady) return;
    updateState = 'idle';
    rebuildTrayMenu();
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true; // 영속 — 이후 어떤 진행/오류 이벤트도 이 사실을 못 지운다
    pendingUpdateVersion = info && info.version ? info.version : null;
    updateState = 'idle'; // 진행 표시 종료
    if (updateCheckTimer) {
      clearInterval(updateCheckTimer); // 받아뒀으니 더는 재확인하지 않는다(상태 churn 방지)
      updateCheckTimer = null;
    }
    rebuildTrayMenu(); // → "📥 업데이트 설치" 항목 등장
  });
  autoUpdater.on('error', () => {
    // 오프라인·레이트리밋 등은 조용히 무시(받아둔 설치본은 보존 — ready 면 손대지 않음).
    if (updateReady) return;
    updateState = 'idle';
    rebuildTrayMenu();
  });

  checkForUpdates(); // 시작 시 1회
  updateCheckTimer = setInterval(checkForUpdates, 60 * 60 * 1000); // 이후 1시간 간격(받으면 위에서 정리)
}

// 자동(시작/주기)·수동(메뉴) 공통 진입점. 거부는 삼켜 unhandled rejection 을 막는다(error 이벤트로 처리).
// 이미 받아뒀으면(ready) 같은 버전을 또 받을 이유가 없으니 재확인하지 않는다.
function checkForUpdates() {
  if (!autoUpdaterActive || updateReady) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

// ── 자동 시작(부팅 시 상주) ──
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(s) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}
function setAutostart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ['--hidden'] });
  const s = readSettings();
  s.autostartConfigured = true;
  s.autostart = enabled;
  writeSettings(s);
  rebuildTrayMenu();
}
function setupAutostartDefault() {
  if (process.env.NMM_SMOKE) return;
  if (!app.isPackaged) return;
  const s = readSettings();
  if (!s.autostartConfigured) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: ['--hidden'] });
    s.autostartConfigured = true;
    s.autostart = true;
    writeSettings(s);
  }
}

// ── 스모크 점검(NMM_SMOKE=1) ──
// 실제 창을 띄워 렌더러가 엔진 번들을 불러 보드를 그리고, 사람 착수 → AI 응수 →
// 힌트 → Esc 숨김까지 도는지 DOM 만 보고 확인한다. 결과는 stdout + NMM_SMOKE_OUT 파일.
function runSmoke() {
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR: ' + e.message);
  const pieces = (sel) => `document.querySelectorAll('${sel}').length`;
  (async () => {
    showPanel('solo');
    await new Promise((r) => setTimeout(r, 200));
    const boot = JSON.parse(
      await js(
        `JSON.stringify({engine: typeof window.NMM, points: ${pieces('#s-board g.pt')}, ` +
          `hint: document.getElementById('s-hint').textContent.trim()})`,
      ),
    );

    // 첫 지점 클릭 → 내 말 1개, 잠시 뒤 AI 응수로 상대 말 1개.
    await js(`document.querySelectorAll('#s-board g.pt')[0].dispatchEvent(new MouseEvent('click', {bubbles: true}))`);
    await new Promise((r) => setTimeout(r, 1800));
    const played = JSON.parse(
      await js(`JSON.stringify({mine: ${pieces('#s-board g.p1')}, theirs: ${pieces('#s-board g.p2')}})`),
    );

    // 힌트 → 추천 지점 표시.
    await js(`document.getElementById('s-hintbtn').click()`);
    await new Promise((r) => setTimeout(r, 900));
    const tips = JSON.parse(await js(`JSON.stringify({tips: ${pieces('#s-board g.tip')}})`));

    // 테마 토글 → body.light 가 뒤집혔다가 되돌아오는지(메인 → 렌더러 왕복).
    // 저장된 테마가 무엇이든 성립하도록 절대값이 아니라 '뒤집힘' 을 본다.
    const isLight = () => js(`document.body.classList.contains('light')`);
    const t0 = await isLight();
    await js(`document.getElementById('s-theme').click()`);
    await new Promise((r) => setTimeout(r, 300));
    const t1 = await isLight();
    await js(`document.getElementById('s-theme').click()`);
    await new Promise((r) => setTimeout(r, 300));
    const t2 = await isLight();
    const themeToggles = t1 !== t0 && t2 === t0;

    // NMM_SMOKE_SHOT 이 있으면 실제 팝업 모습을 PNG 로 남긴다(눈으로 확인용).
    if (process.env.NMM_SMOKE_SHOT) {
      const img = await win.capturePage();
      try {
        fs.writeFileSync(process.env.NMM_SMOKE_SHOT, img.toPNG());
      } catch {
        /* 무시 */
      }
    }

    // 온라인 모드로 전환 → 입장 화면이 보이는지.
    showPanel('mp');
    await new Promise((r) => setTimeout(r, 300));
    const mpVisible = await js(
      `!document.getElementById('mp').classList.contains('hidden') && ` +
        `!document.getElementById('mp-entry').classList.contains('hidden')`,
    );

    // Esc → 창이 파괴되지 않고 숨겨지기만 해야 한다(상태 유지).
    showPanel('solo');
    shownAt = Date.now() - 1000;
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
    await new Promise((r) => setTimeout(r, 400));
    const hidden = !win.isDestroyed() && !win.isVisible();

    const out = { boot, played, tips, themeToggles, mpVisible, escHides: hidden };
    console.log('[nmm] smoke', JSON.stringify(out));
    if (process.env.NMM_SMOKE_OUT) {
      try {
        fs.writeFileSync(process.env.NMM_SMOKE_OUT, JSON.stringify(out, null, 2));
      } catch {
        /* 무시 */
      }
    }
    app.isQuitting = true;
    app.quit();
  })();
}

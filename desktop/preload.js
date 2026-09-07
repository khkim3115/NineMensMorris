// 렌더러에서 창을 '닫지' 않고 '숨기기'만 요청하도록 안전한 API 노출(window.tray).
// 게임 엔진 전역(window.NMM)과 헷갈리지 않게 이름을 분리했다.
// (window.close() 는 창을 파괴해 다시 열 때 상태가 초기화되므로 사용하지 않는다.)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tray', {
  hide: () => ipcRenderer.send('nmm-hide'),
  // 트레이 메뉴(혼자 하기/온라인)가 보낸 모드를 렌더러가 구독 — 'solo' | 'mp'.
  onMode: (cb) => ipcRenderer.on('nmm-mode', (_e, mode) => cb(mode)),
  // 온라인 대전에서 백틱으로 채팅을 펼치면 창 폭을 넓혀달라고 요청.
  setSide: (show) => ipcRenderer.send('nmm-side', !!show),
  // 테마: 메인이 보낸 초기/변경 테마를 렌더러가 구독.
  onTheme: (cb) => ipcRenderer.on('nmm-theme', (_e, mode) => cb(mode)),
  // 렌더러의 ☀️/🌙 토글을 메인에 전달(settings.json 영속화).
  setTheme: (mode) => ipcRenderer.send('nmm-set-theme', mode === 'light' ? 'light' : 'dark'),
  // 투명도: 메인이 보낸 초기/저장값을 렌더러가 구독(슬라이더 복원). 값은 30~100 정수.
  onOpacity: (cb) => ipcRenderer.on('nmm-opacity', (_e, value) => cb(value)),
  // 슬라이더 조작을 메인에 전달. 드래그 중(persist=false)엔 실시간 적용만, 끝(persist=true)에만 저장.
  setOpacity: (value, persist) => ipcRenderer.send('nmm-set-opacity', { value, persist: !!persist }),
});

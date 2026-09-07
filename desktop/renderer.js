// 트레이 팝업 렌더러. 규칙·AI 는 vendor/nmm-engine.js(웹과 같은 src/core+engine 번들)를 그대로 쓰고,
// 온라인 대전은 웹과 같은 nmm_* RPC · Realtime 채널을 쓴다.
// popup.html 의 CSP 가 script-src 'self' 라 인라인이 아닌 별도 파일이어야 한다.

// 규칙·AI 는 웹과 완전히 같은 번들(vendor/nmm-engine.js = src/core + src/engine)을 쓴다.
const N = window.NMM;
const $ = (id) => document.getElementById(id);

// preload 가 만든 전역과 이름이 겹치지 않게 별칭을 쓴다(같은 이름의 const 는 재선언 에러).
// Electron 밖(브라우저로 popup.html 을 열어 레이아웃만 볼 때)에서도 죽지 않도록 폴백을 둔다.
const bridge = window.tray || {
  hide() {},
  setSide() {},
  setTheme(mode) { applyTheme(mode); },
  onMode() {},
  onTheme(cb) { cb('dark'); },
  setOpacity() {},
  onOpacity(cb) { cb(100); },
};

const WIN_REASON = {
  pieces: '말이 2개로 줄었습니다',
  blocked: '움직일 수 있는 말이 없습니다',
  resign: '기권했습니다',
  timeout: '시간 안에 두지 않았습니다',
};
const DRAW_REASON = {
  repetition: '같은 국면이 세 번 반복됐습니다',
  stale: '오랫동안 말을 하나도 떼지 못했습니다',
};

function resultText(result, me) {
  if (result.kind === 'draw') return { title: '무승부', why: DRAW_REASON[result.reason], tone: 'draw' };
  const won = result.winner === me;
  return {
    title: won ? '승리!' : '패배',
    why: (won ? '상대 ' : '내 ') + WIN_REASON[result.reason],
    tone: won ? 'win' : 'lose',
  };
}

/* ── 보드 렌더러(솔로·온라인 공용) ─────────────────────────── */
const RINGS = [[0, 0, 300], [50, 50, 200], [100, 100, 100]];
const SPOKES = [[150, 0, 150, 100], [150, 200, 150, 300], [0, 150, 100, 150], [200, 150, 300, 150]];
const SVGNS = 'http://www.w3.org/2000/svg';

function buildBoard(svg, onPoint) {
  const lines = document.createElementNS(SVGNS, 'g');
  for (const [x, y, size] of RINGS) {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', size); r.setAttribute('height', size);
    r.setAttribute('class', 'bl');
    lines.appendChild(r);
  }
  for (const [x1, y1, x2, y2] of SPOKES) {
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('class', 'bl');
    lines.appendChild(l);
  }
  svg.appendChild(lines);

  const nodes = [];
  for (let i = 0; i < N.POINT_COUNT; i++) {
    const [cx, cy] = N.POINT_XY[i];
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
    const mk = (cls, r) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', cls); c.setAttribute('r', r);
      g.appendChild(c);
      return c;
    };
    mk('hit', 22);
    const node = mk('node', 5);
    const piece = mk('piece hidden', 14);
    const mill = mk('millring hidden', 19);
    const ring = mk('ring', 18);
    g.addEventListener('click', () => onPoint(i));
    svg.appendChild(g);
    nodes.push({ g, node, piece, mill, ring });
  }
  return nodes;
}

/** 상태를 그린다. me 가 null 이면 관전(하이라이트 없음). */
function drawBoard(svg, nodes, state, me, selected, tip) {
  const view = N.boardView(state, me, selected);
  const active = me !== null && state.turn === me && state.phase !== 'over';
  const removing = active && state.mustRemove;
  const mode = !active ? 'idle' : removing ? 'rm' : state.hand[me - 1] > 0 ? 'place' : 'move';
  svg.setAttribute('class', 'board ' + mode);

  const tipTo = !tip ? -1 : tip.k === 'remove' ? tip.at : tip.to;
  for (let i = 0; i < N.POINT_COUNT; i++) {
    const owner = state.board[i];
    const n = nodes[i];
    const cls = ['pt'];
    if (owner === 0) cls.push('empty');
    else cls.push(owner === 1 ? 'p1' : 'p2');
    if (view.playable.has(i)) cls.push('can');
    if (view.selectable.has(i)) cls.push('pickable');
    if (selected === i) cls.push('sel');
    if (i === tipTo) cls.push('tip');
    n.g.setAttribute('class', cls.join(' '));
    n.piece.classList.toggle('hidden', owner === 0);
    n.mill.classList.toggle('hidden', !(owner !== 0 && view.inMill.has(i)));
  }
}

const counts = (state) => [
  (state.hand[0] > 0 ? '손 ' + state.hand[0] + ' · ' : '') + '판 ' + state.onBoard[0],
  (state.hand[1] > 0 ? '손 ' + state.hand[1] + ' · ' : '') + '판 ' + state.onBoard[1],
];

/* ── 테마 · 투명도 · 닫기 ─────────────────────────────────── */
let theme = 'dark';
function applyTheme(mode) {
  theme = mode === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  for (const id of ['s-theme', 'm-theme1', 'm-theme2', 'm-theme3']) {
    const el = $(id);
    if (el) el.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}
const toggleTheme = () => bridge.setTheme(theme === 'dark' ? 'light' : 'dark');
bridge.onTheme(applyTheme);
bridge.onOpacity((v) => {
  $('s-opacity').value = v;
  $('s-opval').textContent = v + '%';
});
$('s-op').addEventListener('click', () => $('s-oprow').classList.toggle('hidden'));
$('s-opacity').addEventListener('input', (e) => {
  $('s-opval').textContent = e.target.value + '%';
  bridge.setOpacity(Number(e.target.value), false);
});
$('s-opacity').addEventListener('change', (e) => bridge.setOpacity(Number(e.target.value), true));
for (const id of ['s-theme', 'm-theme1', 'm-theme2', 'm-theme3']) $(id).addEventListener('click', toggleTheme);
for (const id of ['s-close', 'm-close1', 'm-close2', 'm-close3', 'm-close4']) {
  $(id).addEventListener('click', () => bridge.hide());
}

/* ── 혼자 하기 ─────────────────────────────────────────────── */
const DIFFS = ['easy', 'normal', 'hard'];
let diff = localStorage.getItem('nmm_diff') || 'normal';
if (!DIFFS.includes(diff)) diff = 'normal';
const ME = 1; // 트레이에서는 항상 흑(선공)으로 둔다 — 설정을 줄여 단순하게.

let s = N.createInitialState();
let sel = null;
let past = [];
let thinking = false;
let tip = null;
const sBoard = $('s-board');
const sNodes = buildBoard(sBoard, onSoloPoint);

function renderSolo() {
  drawBoard(sBoard, sNodes, s, thinking ? null : ME, sel, tip);
  const [c1, c2] = counts(s);
  $('s-c1').innerHTML = '<span class="dot dot1"></span>' + c1;
  $('s-c2').innerHTML = '<span class="dot dot2"></span>' + c2;
  $('s-hint').innerHTML = thinking
    ? '<b>AI</b> 생각 중…'
    : '<b>' + N.phaseLabel(s) + '</b> · ' + N.turnHint(s, ME);
  $('s-diff').textContent = N.DIFFICULTY_LABEL[diff];
  $('s-undo').disabled = past.length === 0 || thinking;
  $('s-hintbtn').disabled = thinking || s.phase === 'over' || s.turn !== ME;

  const over = s.phase === 'over';
  $('s-over').classList.toggle('hidden', !over);
  if (over && s.result) {
    const r = resultText(s.result, ME);
    $('s-over-title').textContent = r.title;
    $('s-over-title').className = 'big ' + r.tone;
    $('s-over-why').textContent = r.why;
  }
}

function onSoloPoint(p) {
  if (thinking || s.phase === 'over') return;
  const r = N.resolveClick(s, ME, sel, p);
  if (!r) return;
  if (r.kind === 'select') { sel = r.point; renderSolo(); return; }
  past.push(s);
  s = N.applyMove(s, r.move);
  sel = null;
  tip = null;
  renderSolo();
  runAi();
}

function runAi() {
  if (s.phase === 'over' || s.turn === ME) return;
  thinking = true;
  renderSolo();
  // 탐색은 동기지만 한 프레임 뒤로 미뤄 '생각 중' 을 먼저 그린다.
  setTimeout(() => {
    const m = N.chooseMove(s, diff, { timeBudgetMs: 700 });
    thinking = false;
    if (m) {
      past.push(s);
      s = N.applyMove(s, m);
    }
    renderSolo();
    if (s.turn !== ME && s.phase !== 'over') runAi();
  }, 30);
}

function newGame() {
  s = N.createInitialState();
  past = [];
  sel = null;
  tip = null;
  thinking = false;
  renderSolo();
}

function undo() {
  if (thinking) return;
  while (past.length) {
    const st = past.pop();
    if (st.turn === ME && !st.mustRemove && st.phase !== 'over') {
      s = st; sel = null; tip = null; renderSolo();
      return;
    }
  }
}

$('s-new').addEventListener('click', newGame);
$('s-again').addEventListener('click', newGame);
$('s-undo').addEventListener('click', undo);
$('s-hintbtn').addEventListener('click', () => {
  if (thinking || s.phase === 'over' || s.turn !== ME) return;
  tip = N.bestMove(s, 500).move;
  renderSolo();
});
$('s-diff').addEventListener('click', () => {
  diff = DIFFS[(DIFFS.indexOf(diff) + 1) % DIFFS.length];
  localStorage.setItem('nmm_diff', diff);
  renderSolo();
});

/* ── 온라인 대전 (Supabase, 서버 권위) ─────────────────────── */
// 공개 키 — 보안은 DB 의 RLS + SECURITY DEFINER RPC 가 담당한다(웹과 동일).
const SB_URL = 'https://wrdeqbqwxnmjsbwwnatx.supabase.co';
const SB_KEY = 'sb_publishable_3QuWFZBMzYOdMpfkMjROtw_FBex-xM6';
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const ERROR_KO = [
  ['Anonymous sign-ins are disabled', '익명 로그인이 꺼져 있습니다.'],
  ['room not found', '방을 찾을 수 없습니다.'],
  ['game already started', '이미 시작된 게임입니다.'],
  ['room is full', '방이 가득 찼습니다.'],
  ['need 2 players', '2명이 모여야 시작할 수 있습니다.'],
  ['only host can start', '방장만 시작할 수 있습니다.'],
  ['not your turn', '당신의 차례가 아닙니다.'],
  ['must remove first', '먼저 상대 말을 떼어내세요.'],
  ['protected piece', '밀에 속한 말은 뗄 수 없습니다.'],
  ['illegal move', '둘 수 없는 수입니다.'],
  ['display name required', '닉네임을 입력하세요.'],
];
const errKo = (e) => {
  const msg = (e && e.message) || String(e);
  for (const [n, ko] of ERROR_KO) if (msg.includes(n)) return ko;
  return msg;
};

let mpRoom = null;
let mpPlayers = [];
let myUid = null;
let mpSel = null;
let mpChannel = null;
let mpMessages = [];
let chatOpen = false;
const mBoard = $('m-board');
const mNodes = buildBoard(mBoard, onMpPoint);

const mySeat = () => {
  const me = mpPlayers.find((p) => p.user_id === myUid);
  return me ? me.seat : null;
};
const myColor = () => {
  const seat = mySeat();
  return seat === null || mpRoom === null ? null : seat === mpRoom.black_seat ? 1 : 2;
};

function mpState() {
  if (!mpRoom || mpRoom.turn === null) return null;
  const st = N.stateFromSnapshot({
    board: mpRoom.board,
    turn: mpRoom.turn,
    hand: [mpRoom.hand[0], mpRoom.hand[1]],
    onBoard: [mpRoom.on_board[0], mpRoom.on_board[1]],
    mustRemove: mpRoom.must_remove,
  });
  if (mpRoom.status === 'finished') {
    st.phase = 'over';
    st.result = mpRoom.is_draw
      ? { kind: 'draw', reason: mpRoom.draw_reason || 'stale' }
      : { kind: 'win', winner: mpRoom.winner_seat === mpRoom.black_seat ? 1 : 2, reason: mpRoom.win_reason };
  }
  return st;
}

function showMpScreen(which) {
  for (const id of ['mp-entry', 'mp-room', 'mp-game', 'mp-over']) {
    $(id).classList.toggle('hidden', id !== which);
  }
}

function renderMp() {
  if (!mpRoom) { showMpScreen('mp-entry'); return; }
  if (mpRoom.status === 'lobby') {
    showMpScreen('mp-room');
    $('m-code-show').textContent = mpRoom.code;
    const isHost = mpPlayers.some((p) => p.user_id === myUid && p.is_host);
    $('m-start').disabled = !isHost || mpPlayers.length < 2;
    $('m-start').textContent = mpPlayers.length < 2 ? '상대를 기다리는 중…' : isHost ? '게임 시작' : '방장 대기 중';
    $('m-players').innerHTML = [0, 1]
      .map((seat) => {
        const p = mpPlayers.find((x) => x.seat === seat);
        if (!p) return '<div class="prow empty">빈 자리</div>';
        const tags = (p.is_host ? ' · 방장' : '') + (p.user_id === myUid ? ' · 나' : '');
        return '<div class="prow">' + escapeHtml(p.display_name) + '<span class="cnt">' + tags + '</span></div>';
      })
      .join('');
    return;
  }

  const st = mpState();
  if (!st) { showMpScreen('mp-entry'); return; }
  const me = myColor();
  if (mpRoom.status === 'finished') {
    showMpScreen('mp-over');
    const r = resultText(st.result, me);
    $('m-over-title').textContent = r.title;
    $('m-over-title').className = 'big ' + r.tone;
    $('m-over-why').textContent = r.why;
    return;
  }

  showMpScreen('mp-game');
  const myTurn = st.turn === me;
  drawBoard(mBoard, mNodes, st, myTurn ? me : null, mpSel, null);
  const [c1, c2] = counts(st);
  $('m-c1').innerHTML = '<span class="dot dot1"></span>' + c1;
  $('m-c2').innerHTML = '<span class="dot dot2"></span>' + c2;
  $('m-title').textContent = '온라인 · ' + mpRoom.code;
  $('m-hint').innerHTML = '<b>' + N.phaseLabel(st) + '</b> · ' + N.turnHint(st, me);
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function setMsg(id, text, isErr) {
  const el = $(id);
  el.textContent = text || '';
  el.classList.toggle('err', !!isErr);
}

async function ensureSession() {
  const { data } = await sb.auth.getSession();
  if (data.session && data.session.user) { myUid = data.session.user.id; return myUid; }
  const { data: fresh, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  myUid = fresh.user.id;
  return myUid;
}

async function refetch(roomId) {
  const { data: room } = await sb.from('nmm_rooms').select('*').eq('id', roomId).maybeSingle();
  const { data: players } = await sb.from('nmm_room_players').select('*').eq('room_id', roomId).order('seat');
  if (room) mpRoom = room;
  if (players) mpPlayers = players;
  renderMp();
}

function subscribe(roomId) {
  if (mpChannel) sb.removeChannel(mpChannel);
  mpMessages = [];
  renderChat();
  mpChannel = sb
    .channel('nmm:' + roomId, { config: { broadcast: { self: true } } })
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      mpMessages = mpMessages.concat([payload]).slice(-50);
      renderChat();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nmm_rooms', filter: 'id=eq.' + roomId }, (p) => {
      if (p.eventType === 'DELETE') { mpRoom = null; mpPlayers = []; }
      else { mpRoom = p.new; mpSel = null; }
      renderMp();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nmm_room_players', filter: 'room_id=eq.' + roomId }, (p) => {
      if (p.eventType === 'DELETE') mpPlayers = mpPlayers.filter((x) => x.id !== (p.old && p.old.id));
      else {
        const i = mpPlayers.findIndex((x) => x.id === p.new.id);
        if (i >= 0) mpPlayers[i] = p.new;
        else mpPlayers.push(p.new);
        mpPlayers.sort((a, b) => a.seat - b.seat);
      }
      renderMp();
    })
    .subscribe();
}

async function onMpPoint(p) {
  if (!mpRoom || mpRoom.status !== 'playing') return;
  const st = mpState();
  const me = myColor();
  if (!st || me === null) return;
  const r = N.resolveClick(st, me, mpSel, p);
  if (!r) return;
  if (r.kind === 'select') { mpSel = r.point; renderMp(); return; }
  mpSel = null;
  setMsg('m-msg3', '');
  const m = r.move;
  const res =
    m.k === 'place'
      ? await sb.rpc('nmm_place', { p_room: mpRoom.id, p_to: m.to })
      : m.k === 'move'
        ? await sb.rpc('nmm_move', { p_room: mpRoom.id, p_from: m.from, p_to: m.to })
        : await sb.rpc('nmm_remove', { p_room: mpRoom.id, p_at: m.at });
  if (res.error) {
    setMsg('m-msg3', errKo(res.error), true);
    await refetch(mpRoom.id); // 서버가 거절했으면 우리 모델이 낡았을 수 있다
  }
}

$('m-create').addEventListener('click', async () => {
  const name = $('m-name').value.trim();
  if (!name) return setMsg('m-msg1', '닉네임을 입력하세요.', true);
  setMsg('m-msg1', '방을 만드는 중…');
  try {
    await ensureSession();
    const { data, error } = await sb.rpc('nmm_create_room', { p_display_name: name });
    if (error) throw error;
    localStorage.setItem('nmm_name', name);
    subscribe(data.room_id);
    await refetch(data.room_id);
    setMsg('m-msg1', '');
  } catch (e) {
    setMsg('m-msg1', errKo(e), true);
  }
});

$('m-join').addEventListener('click', joinRoom);
$('m-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
async function joinRoom() {
  const name = $('m-name').value.trim();
  const code = $('m-code').value.trim().toUpperCase();
  if (!name) return setMsg('m-msg1', '닉네임을 입력하세요.', true);
  if (!code) return setMsg('m-msg1', '방 코드를 입력하세요.', true);
  setMsg('m-msg1', '참가하는 중…');
  try {
    await ensureSession();
    const { data, error } = await sb.rpc('nmm_join_room', { p_code: code, p_display_name: name });
    if (error) throw error;
    localStorage.setItem('nmm_name', name);
    subscribe(data.room_id);
    await refetch(data.room_id);
    setMsg('m-msg1', '');
  } catch (e) {
    setMsg('m-msg1', errKo(e), true);
  }
}

$('m-copy').addEventListener('click', () => {
  if (mpRoom) navigator.clipboard.writeText(mpRoom.code).catch(() => {});
});
$('m-start').addEventListener('click', async () => {
  if (!mpRoom) return;
  const { error } = await sb.rpc('nmm_start_game', { p_room: mpRoom.id });
  if (error) setMsg('m-msg2', errKo(error), true);
});
$('m-resign').addEventListener('click', async () => {
  if (!mpRoom) return;
  const { error } = await sb.rpc('nmm_resign', { p_room: mpRoom.id });
  if (error) setMsg('m-msg3', errKo(error), true);
});
for (const id of ['m-leave', 'm-quit', 'm-again']) {
  $(id).addEventListener('click', leaveRoom);
}
async function leaveRoom() {
  if (mpRoom) await sb.rpc('nmm_leave_room', { p_room: mpRoom.id }).catch(() => {});
  if (mpChannel) { sb.removeChannel(mpChannel); mpChannel = null; }
  mpRoom = null; mpPlayers = []; mpSel = null; mpMessages = [];
  setChat(false);
  renderMp();
}

/* 채팅 — Realtime broadcast(웹과 같은 채널·형식). */
function renderChat() {
  $('m-chat-msgs').innerHTML = mpMessages
    .map((m) => {
      const mine = m.userId === myUid;
      return (
        '<div class="cm' + (mine ? ' me' : '') + '"><div class="who">' +
        escapeHtml(mine ? '나' : m.displayName) + '</div><div class="txt">' +
        escapeHtml(m.text) + '</div></div>'
      );
    })
    .join('');
  const box = $('m-chat-msgs');
  box.scrollTop = box.scrollHeight;
}
function setChat(open) {
  chatOpen = !!open;
  $('m-chat').classList.toggle('hidden', !chatOpen);
  bridge.setSide(chatOpen);
  if (chatOpen) $('m-chat-input').focus();
}
$('m-chat-btn').addEventListener('click', () => setChat(!chatOpen));
$('m-chat-input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const text = e.target.value.trim().slice(0, 200);
  e.target.value = '';
  if (!text || !mpChannel || !myUid) return;
  const me = mpPlayers.find((p) => p.user_id === myUid);
  mpChannel.send({
    type: 'broadcast',
    event: 'chat',
    payload: {
      userId: myUid,
      displayName: (me && me.display_name) || localStorage.getItem('nmm_name') || '익명',
      text,
      ts: Date.now(),
    },
  });
});

/* ── 모드 전환 · 단축키 ─────────────────────────────────────── */
let mode = 'solo';
bridge.onMode((m) => {
  mode = m === 'mp' ? 'mp' : 'solo';
  $('solo').classList.toggle('hidden', mode !== 'solo');
  $('mp').classList.toggle('hidden', mode !== 'mp');
  if (mode === 'mp') {
    $('m-name').value = localStorage.getItem('nmm_name') || '';
    renderMp();
  } else {
    renderSolo();
  }
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
  if (e.key === 'Escape') { e.preventDefault(); bridge.hide(); return; }
  if (typing) return;
  if (mode === 'mp') {
    if (e.key === '`') { e.preventDefault(); setChat(!chatOpen); return; }
    if (e.key === 'Enter' && mpRoom && mpRoom.status === 'finished') { e.preventDefault(); leaveRoom(); }
    return;
  }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); newGame(); return; }
  if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); return; }
  if (e.key === 'h' || e.key === 'H') { e.preventDefault(); $('s-hintbtn').click(); return; }
  if (e.key === 'Enter' && s.phase === 'over') { e.preventDefault(); newGame(); return; }
  const d = ['1', '2', '3'].indexOf(e.key);
  if (d >= 0) {
    e.preventDefault();
    diff = DIFFS[d];
    localStorage.setItem('nmm_diff', diff);
    renderSolo();
  }
});

renderSolo();
renderMp();

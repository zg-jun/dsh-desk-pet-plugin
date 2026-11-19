const { app, BrowserWindow, Menu, ipcMain, powerMonitor, screen } = require('electron');
const readline = require('node:readline');
const { centerInside, parkOnPrimary } = require('./display.cjs');
const path = require('path');
const fs = require('fs');
const ORIGIN = process.env.DESK_PET_ORIGIN;
const API = process.env.DESK_PET_API || '/api/desk-pet';
const FLOAT_DIR = process.env.DESK_PET_FLOAT_DIR || __dirname;
const POS_FILE = path.join(FLOAT_DIR, 'pos.json');
const { createHostWatchdog } = require('./host-watchdog.cjs');
app.setPath('userData', path.join(FLOAT_DIR, 'userData'));
// Keep the helper out of the Dock / app switcher: it is a decoration, not an app.
if (app.dock) app.dock.hide();

// The pet is a companion of DSH: when the Host process is gone (quit/crash),
// this child must exit within ~1s instead of becoming an orphan.
const stopHostWatchdog = createHostWatchdog({ hostPid: process.ppid, quit: () => app.quit() });
app.on('will-quit', stopHostWatchdog);

let lastStatus = null;
let requestMenu = null;

function postEvent(payload) {
  const body = typeof payload === 'string' ? { type: payload } : payload;
  try {
    process.stdout.write(`${JSON.stringify({ type: 'ui-event', event: body })}\n`);
  } catch { /* host gone */ }
  return Promise.resolve();
}

function attachStatusInput(win) {
  const stdin = readline.createInterface({ input: process.stdin });
  stdin.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg && msg.type === 'status' && msg.status) {
        lastStatus = msg.status;
        if (!win.isDestroyed()) win.webContents.send('status', msg.status);
        try { process.stdout.write(`${JSON.stringify({ type: 'status-ack', at: Date.now() })}\n`); } catch { /* host gone */ }
      } else if (msg && msg.type === 'command' && msg.command === 'open-settings') {
        postEvent('open-settings');
      } else if (msg && msg.type === 'command' && msg.command === 'menu') {
        if (requestMenu) requestMenu();
      }
    } catch { /* ignore malformed frame */ }
  });
  return stdin;
}

function loadSavedPos() {
  try { return JSON.parse(fs.readFileSync(POS_FILE, 'utf8')); } catch { return null; }
}
function savePos(x, y) {
  try { fs.writeFileSync(POS_FILE, JSON.stringify({ x, y })); } catch { /* best effort */ }
}

// A window whose center sits on a display that no longer exists is invisible
// and unreachable: park it on the primary display's bottom-right corner.
function clampToVisibleDisplay(win) {
  if (win.isDestroyed()) return;
  const b = win.getBounds();
  if (centerInside(b, screen.getAllDisplays())) return;
  const { x: nx, y: ny } = parkOnPrimary(b, screen.getPrimaryDisplay().bounds);
  win.setPosition(nx, ny);
  savePos(nx, ny);
}

// A released window snaps fully inside the display under its center.
function snapToEdge(win) {
  const b = win.getBounds();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const d = screen.getDisplayNearestPoint({ x: cx, y: cy });
  const a = d.bounds;
  const nx = Math.min(Math.max(b.x, a.x), a.x + a.width - b.width);
  const ny = Math.min(Math.max(b.y, a.y), a.y + a.height - b.height);
  if (nx !== b.x || ny !== b.y) win.setPosition(nx, ny);
  savePos(nx, ny);
}

function installSleepLifecycle(win) {
  // Sleep is a display pause, not a user "off": hide the overlay while the
  // display is asleep and bring it back on resume. Keeping the process alive
  // avoids a wake-time runtime/start race.
  let suspended = false;
  const onSuspend = () => {
    if (win.isDestroyed() || !win.isVisible()) return;
    suspended = true;
    win.hide();
  };
  const onResume = () => {
    if (win.isDestroyed() || !suspended) return;
    suspended = false;
    clampToVisibleDisplay(win);
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });
  };
  powerMonitor.on('suspend', onSuspend);
  powerMonitor.on('resume', onResume);
  win.on('closed', () => {
    powerMonitor.removeListener('suspend', onSuspend);
    powerMonitor.removeListener('resume', onResume);
  });
}

app.whenReady().then(() => {
  const zh = (app.getLocale() || '').toLowerCase().startsWith('zh');
  // A small movable window (the petdex pattern): macOS drags normal windows
  // across displays natively — only static full-span overlays get clipped.
  const seedX = Math.round(Number(process.env.DESK_PET_X) || 0);
  const seedY = Math.round(Number(process.env.DESK_PET_Y) || 0);
  const saved = loadSavedPos();
  let x;
  let y;
  if (saved && typeof saved.x === 'number'
      && screen.getAllDisplays().some((d) => {
        const a = d.bounds;
        return saved.x + 150 >= a.x && saved.x + 150 < a.x + a.width && saved.y + 88 >= a.y && saved.y + 88 < a.y + a.height;
      })) {
    // the saved spot still exists
    x = saved.x;
    y = saved.y;
  } else if (seedX && seedY) {
    x = seedX - 150;
    y = seedY - 88;
  } else {
    const c = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(c).bounds;
    x = a.x + a.width - 300 - 24;
    y = a.y + a.height - 175 - 24;
  }
  const win = new BrowserWindow({
    width: 300, height: 175, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, resizable: false, movable: true,
    focusable: false, acceptFirstMouse: true, hiddenInMissionControl: true, enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(FLOAT_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The settings page asks for bounds through the same fit path as bubbles.
  attachStatusInput(win);

  ipcMain.on('fit-content', (_event, w, h) => {
    if (win.isDestroyed()) return;
    const nw = Math.round(Math.max(220, Math.min(560, Number(w) || 0)));
    const nh = Math.round(Math.max(160, Math.min(720, Number(h) || 0)));
    const b = win.getBounds();
    if (b.width === nw && b.height === nh) return;
    const d = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const a = d.workArea;
    // prefer keeping the bottom-right corner; clamp inside the display
    const nx = Math.min(Math.max(b.x + b.width - nw, a.x), a.x + a.width - nw);
    const ny = Math.min(Math.max(b.y + b.height - nh, a.y), a.y + a.height - nh);
    win.setBounds({ x: nx, y: ny, width: nw, height: nh });
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Click-through by default: empty/transparent window areas must not eat
  // clicks meant for whatever is underneath.
  win.setIgnoreMouseEvents(true, { forward: true });
  // Hot-unplugged displays: the window must never be stranded off-screen.
  const rehome = () => clampToVisibleDisplay(win);
  screen.on('display-removed', rehome);
  screen.on('display-added', rehome);
  screen.on('display-metrics-changed', rehome);
  installSleepLifecycle(win);
  // The overlay animates forever; Chromium's background throttling would
  // otherwise freeze rAF at random (the occasional dead-pet bug).
  win.webContents.setBackgroundThrottling(false);
  win.loadURL(ORIGIN + API + '/float');
  win.webContents.on('did-finish-load', () => {
    try { process.stdout.write(`${JSON.stringify({ type: 'ipc-ping', at: Date.now() })}\n`); } catch { /* host gone */ }
    if (lastStatus) win.webContents.send('status', lastStatus);
  });
  win.on('closed', () => app.quit());
  win.on('moved', () => {
    const b = win.getBounds();
    savePos(b.x, b.y);
  });

  // Drag: renderer reports start/end once; the main process follows the
  // cursor directly — native-feel, crosses displays, no polling handoff.
  let dragTimer = null;
  let gdx = 0;
  let gdy = 0;
  ipcMain.on('drag-start', (_e, dx, dy) => {
    gdx = dx;
    gdy = dy;
    if (dragTimer) return;
    dragTimer = setInterval(() => {
      if (win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      win.setPosition(Math.round(p.x - gdx), Math.round(p.y - gdy));
    }, 8);
  });
  ipcMain.on('drag-end', () => {
    if (dragTimer) {
      clearInterval(dragTimer);
      dragTimer = null;
    }
    if (!win.isDestroyed()) snapToEdge(win);
  });
  ipcMain.on('open-session', (_e, id) => {
    if (typeof id === 'string' && id) postEvent({ type: 'open-session', sessionId: id });
  });
  // Raise the DSH app by bundle id (name-independent).
  const focusDsh = () => {
    if (process.platform !== 'darwin') return;
    try {
      require('node:child_process').spawn('/usr/bin/open', ['-b', 'com.deepseek.dsh'], { detached: true, stdio: 'ignore' }).unref();
    } catch { /* best effort */ }
  };
  ipcMain.on('focus-app', focusDsh);
  ipcMain.on('quit-pet', () => { postEvent('quit-pet').finally(() => app.quit()); });
  ipcMain.on('pet-answer', (_e, payload) => {
    if (payload && typeof payload.sessionId === 'string') postEvent({ type: 'pet-answer', ...payload });
  });
  let hitRegion = null;
  let hovering = false;
  ipcMain.on('hit-region', (_e, rect) => {
    if (!rect || typeof rect !== 'object') return;
    const x = Number(rect.x), y = Number(rect.y), w = Number(rect.w), h = Number(rect.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
    hitRegion = { x, y, w, h };
  });
  // Renderer mousemove forwarding is unreliable on a non-focusable, initially
  // click-through window. Poll the cursor against the renderer-reported hit
  // region so the pet becomes interactive before the user presses a button.
  const hoverTimer = setInterval(() => {
    if (win.isDestroyed() || !hitRegion) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const inside = p.x >= b.x + hitRegion.x && p.x < b.x + hitRegion.x + hitRegion.w
      && p.y >= b.y + hitRegion.y && p.y < b.y + hitRegion.y + hitRegion.h;
    if (inside === hovering) return;
    hovering = inside;
    win.setIgnoreMouseEvents(!inside, { forward: true });
    try { process.stdout.write(`${JSON.stringify({ type: 'hover', on: inside })}\n`); } catch { /* host gone */ }
  }, 30);
  win.on('closed', () => clearInterval(hoverTimer));
  ipcMain.on('set-interactive', (_e, on) => {
    if (win.isDestroyed()) return;
    try { process.stdout.write(`${JSON.stringify({ type: 'interactive', on: !!on })}\n`); } catch { /* host gone */ }
    // forward keeps mousemove flowing so hover can turn interaction back on
    win.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.on('settings', () => postEvent('open-settings'));
  ipcMain.on('hide-pet', () => { if (!win.isDestroyed()) win.webContents.send('hint-before-hide'); });
  const showMenu = () => {
    if (win.isDestroyed()) return;
    try { process.stdout.write(`${JSON.stringify({ type: 'menu-request', at: Date.now() })}\n`); } catch { /* host gone */ }
    try { app.focus({ steal: true }); } catch { /* best effort */ }
    const menu = Menu.buildFromTemplate([
      { label: zh ? '设置宠物' : 'Pet settings', click: () => { focusDsh(); postEvent('open-settings'); } },
      { type: 'separator' },
      { label: zh ? '隐藏' : 'Hide', click: () => { if (!win.isDestroyed()) win.webContents.send('hint-before-hide'); } },
    ]);
    menu.popup({ window: win });
  };
  requestMenu = showMenu;
  ipcMain.on('menu', showMenu);
});

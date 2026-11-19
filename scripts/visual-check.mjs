// Capture the float renderer for one injected status, using Electron's own
// capturePage (no screen recording, no desktop background).
// Usage: node scripts/visual-check.mjs --name approval --status '<json>' [--width 420 --height 320]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const name = value('--name', 'check');
const width = Number(value('--width', 420));
const height = Number(value('--height', 320));
const click = value('--click', '');
const lang = value('--lang', '');
const status2 = value('--status2', '') ? JSON.parse(value('--status2', '')) : null;
const status = JSON.parse(value('--status', JSON.stringify({
  ok: true, mode: 'idle', slug: 'bench', task: '', kind: '', sessionId: '',
  pending: null, opacity: 1, size: 1, petOn: true,
})));
const ROOT = path.resolve(import.meta.dirname, '..');
const APP_DIR = path.join(ROOT, '.tmp/visual-app');
const ELECTRON = process.env.DESK_PET_REAL_ELECTRON
  || path.join(os.homedir(), '.petdex/dsh-float/runtime/Electron.app/Contents/MacOS/Electron');

const html = await readFile(path.join(ROOT, 'dist/screen/float.html'), 'utf8');
const core = await readFile(path.join(ROOT, 'dist/pet-core.js'), 'utf8');
const stub = `<script>window.deskPet={fitContent(){},setInteractive(on){window.__ia=(window.__ia||[]).concat([!!on]);},hitRegion(){},quitPet(){},onHintBeforeHide(){},menu(){window.__menu=(window.__menu||0)+1;},settings(){window.__settings=(window.__settings||0)+1;},hidePet(){window.__hide=(window.__hide||0)+1;},dragStart(){window.__dragStart=(window.__dragStart||0)+1;},dragEnd(){window.__dragEnd=(window.__dragEnd||0)+1;},openSession(){window.__opened=(window.__opened||[]).concat([arguments[0]]);},focusApp(){},petAnswer(){window.__answers=(window.__answers||[]).concat([Array.from(arguments)])}};</script>`;
const coreTag = `<script>${core.replace(/<\/script/gi, '<\\/script')}</script>`;
const page = html.replace('<script id="pet-core"></script>', coreTag + stub);

const startedAt = Date.now();
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/' || url.pathname === '/float') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page);
    return;
  }
  if (url.pathname === '/api/desk-pet/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
    if (status2) setTimeout(() => { try { res.write(`event: status\ndata: ${JSON.stringify(status2)}\n\n`); } catch { /* closed */ } }, 800);
    return;
  }
  if (url.pathname === '/api/desk-pet/status') {
    // status2 lets a capture show a state transition (working → done) from
    // the 350ms status poll instead of only the SSE channel.
    const current = status2 && Date.now() - startedAt > 800 ? status2 : status;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(current));
    return;
  }
  if (url.pathname === '/api/desk-pet/pet/bench/sprite') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1872" viewBox="0 0 1536 1872"><rect width="1536" height="1872" fill="#222"/><circle cx="96" cy="104" r="78" fill="#ffd166"/><circle cx="72" cy="92" r="7" fill="#3a2c1a"/><circle cx="120" cy="92" r="7" fill="#3a2c1a"/></svg>';
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' });
    res.end(svg);
    return;
  }
  res.writeHead(404); res.end('not found');
});

const port = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const url = `http://127.0.0.1:${port}/float`;
const out = path.join(os.tmpdir(), `pet-visual-${name}.png`);

const mainJs = `const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const url = process.env.VISUAL_URL;
const out = process.env.VISUAL_OUT;
app.whenReady().then(async () => {
  if (process.env.VISUAL_DARK === '1') require('electron').nativeTheme.themeSource = 'dark';
  const win = new BrowserWindow({
    width: ${width}, height: ${height}, show: false,
    webPreferences: { contextIsolation: false, backgroundThrottling: false, paintWhenInitiallyHidden: true },
  });
  await win.loadURL(url);
  if (process.env.VISUAL_CAT === '1') {
    await win.webContents.executeJavaScript("(()=>{const st=document.createElement('style'); st.textContent='#c{display:none!important}#cat{display:block!important}'; document.head.appendChild(st);})()");
  }
  await new Promise((r) => setTimeout(r, 1600));
  if (${JSON.stringify(click)} === 'approve') {
    const clicked = await win.webContents.executeJavaScript(\`(()=>{const el=[...document.querySelectorAll('span')].find((x)=>x.textContent==='批准'||x.textContent==='Approve'); if(!el) return {clicked:false}; el.click(); return {clicked:true, answers: window.__answers||[]};})()\`);
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 500));
  }
  if (${JSON.stringify(click)} === 'drag') {
    const clicked = await win.webContents.executeJavaScript("(()=>{const pet=document.getElementById('pet'); const opts={bubbles:true,clientX:200,clientY:250,screenX:200,screenY:250,button:0}; pet.dispatchEvent(new MouseEvent('mousedown',opts)); window.dispatchEvent(new MouseEvent('mousemove',{...opts,screenX:260,screenY:300})); window.dispatchEvent(new MouseEvent('mouseup',opts)); return {dragStart: window.__dragStart||0, dragEnd: window.__dragEnd||0};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'hit-test') {
    const tested = await win.webContents.executeJavaScript("(()=>{const cat=document.getElementById('cat'); const rect=cat.getBoundingClientRect(); const x=rect.left+rect.width/2, y=rect.top+rect.height/2; document.dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true})); document.getElementById('pet').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:x,clientY:y})); return {lastInteractive:(window.__ia||[]).slice(-1)[0], menuCalls:window.__menu||0, catRect:{w:rect.width,h:rect.height}};})()");
    console.log('CLICK ' + JSON.stringify(tested));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'menu-open' || ${JSON.stringify(click)} === 'menu') {
    const opened = await win.webContents.executeJavaScript("(()=>{const pet=document.getElementById('pet'); pet.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:250})); return {menuCalls: window.__menu||0};})()");
    console.log('CLICK ' + JSON.stringify(opened));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'hide') {
    const clicked = await win.webContents.executeJavaScript("(()=>{window.deskPet.hidePet(); return {hidden: window.__hide||0};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'question-submit') {
    const clicked = await win.webContents.executeJavaScript("(()=>{const opts=[...document.querySelectorAll('.chips .chip')]; const second=opts[1]||opts[0]; if(!second) return {ok:false,reason:'no-options'}; second.click(); const submit=document.querySelector('.foot .btn.pri'); if(!submit) return {ok:false,reason:'no-submit'}; const disabled=submit.classList.contains('disabled'); submit.click(); return {ok:true,selected:second.classList.contains('sel'),disabledBefore:disabled,answers: window.__answers||[]};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'question-skip') {
    const clicked = await win.webContents.executeJavaScript("(()=>{const skip=document.querySelector('.foot .btn.ghost'); if(!skip) return {ok:false}; skip.click(); return {ok:true,answers: window.__answers||[]};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'summary') {
    const expanded = await win.webContents.executeJavaScript("(()=>{const b=document.getElementById('sumMore'); if(!b) return {expanded:false,missing:true}; b.click(); return {expanded: document.getElementById('sumA')?.classList.contains('expanded'), label:b.textContent};})()");
    console.log('CLICK ' + JSON.stringify(expanded));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'more') {
    const expanded = await win.webContents.executeJavaScript("(()=>{const b=[...document.querySelectorAll('.bubble-more')].find((x)=>!x.hidden && x.offsetParent!==null); if(!b) return {missing:true}; b.click(); const bub=b.closest('.bubble'); return {label:b.textContent, expanded:!!bub?.classList.contains('expanded'), bubble:bub?.className};})()");
    console.log('CLICK ' + JSON.stringify(expanded));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'bubble') {
    const clicked = await win.webContents.executeJavaScript("(()=>{const el=document.querySelector('.bubble.alert.clickable')||document.querySelector('.bubble.status.clickable'); if(!el) return {clicked:false}; el.click(); return {clicked:true, opened: window.__opened||[]};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 300));
  }
  if (${JSON.stringify(click)} === 'pet') {
    const clicked = await win.webContents.executeJavaScript("(()=>{const el=document.getElementById('pet'); if(!el) return {clicked:false}; const opts={bubbles:true,clientX:200,clientY:250,screenX:200,screenY:250}; el.dispatchEvent(new MouseEvent('mousedown',opts)); window.dispatchEvent(new MouseEvent('mouseup',opts)); return {clicked:true, greet: document.querySelector('.bubble.greet')?.textContent||''};})()");
    console.log('CLICK ' + JSON.stringify(clicked));
    await new Promise((r) => setTimeout(r, 350));
  }
  const image = await win.webContents.capturePage();
  fs.writeFileSync(out, image.toPNG());
  console.log('CAPTURED ' + out + ' ' + image.getSize().width + 'x' + image.getSize().height);
  app.quit();
});
`;
await mkdir(APP_DIR, { recursive: true });
await writeFile(path.join(APP_DIR, 'package.json'), JSON.stringify({ name: 'desk-pet-visual', main: 'main.js' }));
await writeFile(path.join(APP_DIR, 'main.js'), mainJs);
const env = { ...process.env, VISUAL_URL: url, VISUAL_OUT: out, VISUAL_CLICK: click, VISUAL_DARK: value('--dark',''), VISUAL_CAT: value('--cat','') };
if (status2) env.VISUAL_STATUS2 = '1';
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(ELECTRON, [APP_DIR, '--no-sandbox', '--disable-gpu', ...(lang ? [`--lang=${lang}`] : []), ...(value('--dark','') === '1' ? ['--force-dark-mode'] : []), `--user-data-dir=${path.join(APP_DIR, 'userData')}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });
await new Promise((resolve) => child.on('exit', resolve));
server.close();
if (log.includes('CAPTURED')) {
  console.log(log.trim());
} else {
  console.error(log);
  process.exit(1);
}

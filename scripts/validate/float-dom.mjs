// Renders the CURRENT float HTML (extracted verbatim from index.js) in jsdom and
// snapshots what the user would see: bubble classes/text, dots, halo, animation.
// Proves the DOM-parity approach; jsdom has no layout, so bounds must come from
// Electron later (documented in the validation report).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const CHECK = process.argv.includes('--check');
const localRequire = createRequire(import.meta.url);
let jsdomModule;
try {
  jsdomModule = localRequire('jsdom');
} catch (localError) {
  // Backward-compatible escape hatch for environments without devDependencies.
  if (process.env.JSDOM_HOME) {
    try { jsdomModule = createRequire(`${process.env.JSDOM_HOME}/package.json`)('jsdom'); } catch { /* keep undefined */ }
  }
  if (!jsdomModule) {
    const message = `jsdom unavailable (${localError.message})`;
    if (CHECK) {
      console.log(`SKIP check:dom — ${message}`);
      process.exit(0);
    }
    throw new Error(`${message}; run npm install`);
  }
}
const { JSDOM, VirtualConsole } = jsdomModule;
const cssErrors = [];

let html = await readFile('dist/screen/float.html', 'utf8');
const core = await readFile('dist/pet-core.js', 'utf8');
html = html.replace('<script id="pet-core"></script>', `<script>${core.replace(/<\/script/gi, '<\\/script')}</script>`);

const BOOTSTRAP = `<script>
window.__calls = [];
window.deskPet = {
  dragStart(){}, dragEnd(){}, menu(){}, focusApp(){}, setScale(){}, quitPet(){}, setInteractive(){},
  openSession(id){ window.__calls.push(['openSession', id]); },
  petAnswer(sid, kind, answer){ window.__calls.push(['petAnswer', sid, kind, answer]); },
  fitContent(w, h){ window.__calls.push(['fitContent', Math.round(w), Math.round(h)]); },
  onHintBeforeHide(){},
};
window.fetch = function () { return new Promise(function () {}); };
HTMLCanvasElement.prototype.getContext = function () {
  return { clearRect(){}, drawImage(){}, getImageData(){ return { data: [0, 0, 0, 0] }; } };
};
</script>`;
html = html.replace('<title>Desk Pet</title>', `<title>Desk Pet</title>${BOOTSTRAP}`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function snapshot(win) {
  const doc = win.document;
  const bubble = (sel) => {
    const el = doc.querySelector(sel);
    if (!el) return null;
    return {
      cls: el.className,
      display: el.style.display || '(default)',
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      dot: el.style.getPropertyValue('--dot-c')
        || (el.querySelector('.dot') ? el.querySelector('.dot').style.getPropertyValue('--dot-c') : '')
        || '',
      children: [...el.children].map((c) => ({
        cls: c.className,
        text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
      })),
    };
  };
  return {
    anim: win.currentAnim,
    switching: !!win.switching,
    pendingKind: win.pending ? win.pending.kind : null,
    bubbles: {
      status: bubble('.bubble.status'),
      alert: bubble('.bubble.alert'),
      greet: bubble('.bubble.greet'),
      act: bubble('.bubble.act'),
    },
    halo: (() => {
      const h = doc.getElementById('halo');
      return { display: h.style.display || '(default)', bg: h.style.background.slice(0, 80) };
    })(),
    bob: doc.getElementById('bob').className,
    eyes: {
      open: doc.getElementById('eyesOpen').style.display || '(default)',
      happy: doc.getElementById('eyesHappy').style.display || '(default)',
    },
    sprite: {
      canvas: doc.getElementById('c').style.display || '(default)',
      cat: doc.getElementById('cat').style.display || '(default)',
    },
    vars: {
      alpha: doc.documentElement.style.getPropertyValue('--pet-alpha'),
      bubbleAlpha: doc.documentElement.style.getPropertyValue('--bubble-alpha'),
      scale: doc.documentElement.style.getPropertyValue('--pet-scale'),
    },
  };
}

function makeDom(lang) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:56777/',
    virtualConsole: new VirtualConsole().on('jsdomError', (e) => {
      if (/Could not parse CSS/i.test(e.message)) cssErrors.push(e.message);
    }),
    beforeParse(win) {
      Object.defineProperty(win.navigator, 'language', { value: lang, configurable: true });
      // deterministic clock-independent greeting tests set greetUntil explicitly
      win.__now = () => Date.now();
    },
  });
  return dom;
}

const CASES = [
  { name: 'idle', set: {} },
  { name: 'working', set: { mode: 'working', taskText: 'Refactor plan analysis', currentSessionId: 's1' } },
  { name: 'working-no-session', set: { mode: 'working', taskText: 'Background job', currentSessionId: '' } },
  { name: 'waiting-approval', set: { mode: 'waiting', kind: 'approval', taskText: 'cleanup', currentSessionId: 's1', pending: { kind: 'approval', sessionId: 's1', summary: 'Run rm -rf /tmp/x' } } },
  { name: 'waiting-question', set: { mode: 'waiting', kind: 'question', taskText: 'Which DB?', currentSessionId: 's1', pending: { kind: 'question', sessionId: 's1', questionId: 'q1', summary: 'Which database?', multi: false, options: [{ label: 'Postgres', description: 'relational', recommended: true }, { label: 'MySQL', description: '', recommended: false }] } } },
  { name: 'waiting-question-multi', set: { mode: 'waiting', kind: 'question', taskText: 'Pick', currentSessionId: 's1', pending: { kind: 'question', sessionId: 's1', questionId: 'q1', summary: 'Pick features', multi: true, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }] } } },
  { name: 'waiting-other', set: { mode: 'waiting', kind: 'question', taskText: 'Batch 1/2', currentSessionId: 's1', pending: { kind: 'other', sessionId: 's1', summary: '' } } },
  { name: 'done', set: { mode: 'done', taskText: 'Build passed', currentSessionId: 's1' } },
  { name: 'greeting', set: { mode: 'idle', greetUntil: Date.now() + 5000 } },
  { name: 'switching', set: { mode: 'idle', switching: true } },
  { name: 'hint-before-hide', set: { mode: 'idle', hintUntil: Date.now() + 5000, greetUntil: Date.now() + 5000 } },
];

const out = {};
for (const lang of ['en-US', 'zh-CN']) {
  const dom = makeDom(lang);
  const win = dom.window;
  await new Promise((r) => win.addEventListener('load', r, { once: true }));
  await wait(30);
  const langOut = {};
  for (const c of CASES) {
    // reset the state the renderer reads
    win.greetUntil = 0;
    win.hintUntil = 0;
    win.switching = false;
    win.dragging = false;
    win.pending = null;
    win.mode = 'idle';
    win.kind = '';
    win.taskText = '';
    win.currentSessionId = '';
    win.img = null;
    for (const [k, v] of Object.entries(c.set)) win[k] = v;
    win.render();
    await wait(30);
    langOut[c.name] = snapshot(win);
  }
  // appearance matrix
  win.applyLayerAlpha(0.6);
  win.applyLayerScale(1.3);
  win.render();
  await wait(30);
  langOut['appearance-0.6-1.3'] = snapshot(win);
  out[lang] = langOut;
  dom.window.close();
}

if (cssErrors.length) {
  console.error(`CSS PARSE FAIL: ${cssErrors.length} stylesheet(s) rejected by jsdom`);
  process.exit(1);
}

const golden = {
  source: 'dist/screen/float.html @ 2.0.0-beta.1',
  note: 'DOM-level characterization (jsdom). No layout: bounds are validated separately.',
  cases: out,
};
if (CHECK) {
  const expected = JSON.parse(await readFile('test/fixtures/status/expected.json', 'utf8'));
  const diffs = [];
  for (const lang of new Set([...Object.keys(expected.cases), ...Object.keys(out)])) {
    for (const name of new Set([...Object.keys(expected.cases[lang] || {}), ...Object.keys(out[lang] || {})])) {
      if (JSON.stringify(expected.cases[lang]?.[name]) !== JSON.stringify(out[lang]?.[name])) diffs.push(`${lang}/${name}`);
    }
  }
  if (diffs.length) {
    console.error(`DOM PARITY FAIL (${diffs.length}): ${diffs.join(', ')}`);
    process.exit(1);
  }
  console.log(`DOM PARITY OK: ${Object.keys(out).length} locales`);
  process.exit(0);
}

await mkdir('test/fixtures/status', { recursive: true });
await writeFile('test/fixtures/status/expected.json', `${JSON.stringify(golden, null, 2)}\n`);

console.log('sample (en-US):');
for (const name of ['working', 'waiting-approval', 'waiting-question', 'waiting-other', 'done', 'greeting']) {
  const c = out['en-US'][name];
  console.log(`\n### ${name} anim=${c.anim} fit=${JSON.stringify(c.fit)}`);
  for (const [k, b] of Object.entries(c.bubbles)) {
    if (!b) continue;
    console.log(`  ${k.padEnd(6)} display=${b.display.padEnd(9)} dot=${b.dot} cls=${b.cls}`);
    if (b.text) console.log(`         text="${b.text.slice(0, 90)}"`);
  }
}
console.log(`\nappearance: ${JSON.stringify(out['en-US']['appearance-0.6-1.3'].vars)}`);
console.log(`wrote test/fixtures/status/expected.json`);
process.exit(0);

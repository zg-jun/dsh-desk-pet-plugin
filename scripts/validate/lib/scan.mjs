// Source scanner shared by validation/check tooling.
// Dependency-free: masks comments/strings/template literals, then locates
// function bodies with brace matching.

const MASK = ' ';

/**
 * Replace comments, strings and template literals with spaces, preserving
 * newlines and `${...}` expression bodies (which stay as code).
 * States: code | line | block | quote | template | expr(depth)
 */
export function maskSource(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) if (out[k] !== '\n') out[k] = MASK;
  };
  const stack = [{ type: 'code', quote: '', depth: 0 }];
  let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const d = src[i + 1];

    if (top.type === 'line') {
      if (c === '\n') { stack.pop(); i += 1; continue; }
      blank(i, i + 1); i += 1; continue;
    }
    if (top.type === 'block') {
      if (c === '*' && d === '/') { blank(i, i + 2); stack.pop(); i += 2; continue; }
      blank(i, i + 1); i += 1; continue;
    }
    if (top.type === 'quote') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === top.quote) { blank(i, i + 1); stack.pop(); i += 1; continue; }
      blank(i, i + 1); i += 1; continue;
    }
    if (top.type === 'template') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') { blank(i, i + 1); stack.pop(); i += 1; continue; }
      if (c === '$' && d === '{') { blank(i, i + 2); stack.push({ type: 'expr', depth: 0 }); i += 2; continue; }
      blank(i, i + 1); i += 1; continue;
    }

    // code / expr
    if (c === '/' && d === '/') { stack.push({ type: 'line' }); blank(i, i + 2); i += 2; continue; }
    if (c === '/' && d === '*') { stack.push({ type: 'block' }); blank(i, i + 2); i += 2; continue; }
    if (c === '"' || c === "'") { stack.push({ type: 'quote', quote: c }); blank(i, i + 1); i += 1; continue; }
    if (c === '`') { stack.push({ type: 'template' }); blank(i, i + 1); i += 1; continue; }
    if (top.type === 'expr') {
      if (c === '{') { top.depth += 1; i += 1; continue; }
      if (c === '}') {
        if (top.depth === 0) { blank(i, i + 1); stack.pop(); i += 1; continue; }
        top.depth -= 1; i += 1; continue;
      }
    }
    i += 1;
  }
  return out.join('');
}

const OPEN_BRACE = '{';
const CLOSE_BRACE = '}';
const OPEN_PAREN = '(';
const CLOSE_PAREN = ')';

function matchingParen(masked, openIndex) {
  let depth = 0;
  for (let k = openIndex; k < masked.length; k += 1) {
    if (masked[k] === OPEN_PAREN) depth += 1;
    else if (masked[k] === CLOSE_PAREN) { depth -= 1; if (depth === 0) return k; }
  }
  return -1;
}

/** Body opening brace for a match, or -1 when the construct has no block body. */
function bodyOpen(masked, m) {
  const text = m[0];
  const last = text.trimEnd().slice(-1);
  if (last === OPEN_BRACE) return m.index + text.lastIndexOf(OPEN_BRACE);
  if (last === '(') {
    const close = matchingParen(masked, m.index + text.length - 1);
    if (close < 0) return -1;
    const open = masked.indexOf(OPEN_BRACE, close);
    return open;
  }
  // arrow: only a block body counts
  const after = m.index + m[0].length;
  const k = masked.indexOf(OPEN_BRACE, after);
  if (k < 0) return -1;
  const between = masked.slice(after, k);
  return between.trim() === '' ? k : -1;
}

const FN_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/gm,
  /^\s*(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
  /^\s*(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:async\s*)?[\w$]+\s*=>/gm,
  /^\s{2,}(?!if\b|for\b|while\b|switch\b|catch\b|function\b|return\b|else\b|do\b|try\b)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/gm,
];

export function functions(masked, raw) {
  const found = [];
  for (const re of FN_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked))) {
      const open = bodyOpen(masked, m);
      if (open < 0) continue;
      let depth = 0;
      let close = -1;
      for (let k = open; k < masked.length; k += 1) {
        if (masked[k] === OPEN_BRACE) depth += 1;
        else if (masked[k] === CLOSE_BRACE) { depth -= 1; if (depth === 0) { close = k; break; } }
      }
      if (close < 0) continue;
      const body = masked.slice(open, close + 1);
      const lines = raw.slice(open, close + 1).split('\n').length;
      const cyclomatic = (body.match(/\bif\b|\bfor\b|\bwhile\b|\bcase\b|\bcatch\b|&&|\|\||\?\./g) || []).length + 1;
      found.push({
        name: m[1],
        line: masked.slice(0, m.index).split('\n').length,
        start: m.index,
        end: close + 1,
        lines,
        cyclomatic,
        effects: {
          fetch: (body.match(/\bfetch\(/g) || []).length,
          dom: (body.match(/document\.|getElementById|querySelector/g) || []).length,
          timers: (body.match(/setInterval\(|setTimeout\(|requestAnimationFrame\(/g) || []).length,
        },
      });
    }
  }
  const seen = new Set();
  return found
    .filter((f) => {
      const key = `${f.line}:${f.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}

/** Repeated normalized line windows (textual near-duplicate signal). */
export function duplicateWindows(raw, size = 12) {
  const lines = raw.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const index = new Map();
  const hits = [];
  for (let i = 0; i + size <= lines.length; i += 1) {
    const key = lines.slice(i, i + size).join('\n');
    if (index.has(key)) hits.push({ first: index.get(key), second: i, lines: size });
    else index.set(key, i);
  }
  return hits;
}

// Static baseline metrics for B0 validation.
import { readFile } from 'node:fs/promises';
import { maskSource, functions, duplicateWindows } from './lib/scan.mjs';

function embeddedScripts(raw) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(raw))) if (m[1].trim().length > 200) out.push(m[1]);
  return out;
}

function measure(label, raw) {
  const masked = maskSource(raw);
  const fns = functions(masked, raw);
  return {
    file: label,
    lineCount: raw.split('\n').length,
    functions: fns.length,
    hex: (raw.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
    rgba: (raw.match(/\brgba?\(/g) || []).length,
    timers: {
      setInterval: (raw.match(/setInterval\(/g) || []).length,
      setTimeout: (raw.match(/setTimeout\(/g) || []).length,
      raf: (raw.match(/requestAnimationFrame\(/g) || []).length,
    },
    longest: [...fns].sort((a, b) => b.lines - a.lines).slice(0, 8)
      .map(({ name, line, lines, cyclomatic }) => ({ name, line, lines, cyclomatic })),
    complex: [...fns].sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 5)
      .map(({ name, line, lines, cyclomatic }) => ({ name, line, lines, cyclomatic })),
    duplicateWindows: duplicateWindows(raw).length,
  };
}

const QUIET = process.argv.includes('--quiet');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const report = { files: [], totals: {} };
for (const file of files) {
  const raw = await readFile(file, 'utf8');
  report.files.push(measure(file, raw));
  for (const [idx, body] of embeddedScripts(raw).entries()) {
    report.files.push(measure(`${file}#embedded-${idx + 1}`, body));
  }
}
report.totals = {
  duplicateWindows: report.files.reduce((s, f) => s + f.duplicateWindows, 0),
  colorLiterals: report.files.reduce((s, f) => s + f.hex + f.rgba, 0),
  lines: report.files.reduce((s, f) => s + f.lineCount, 0),
};
if (QUIET) {
  console.log(`metrics: ${report.files.length} units, ${report.totals.lines} lines, ${report.totals.colorLiterals} color literals`);
} else {
  console.log(JSON.stringify(report, null, 2));
}

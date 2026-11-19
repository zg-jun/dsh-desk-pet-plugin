import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../../src/index.js', import.meta.url)), 'utf8');

describe('runtime install wiring', () => {
  it('activates the pet after a successful install', () => {
    const start = SRC.indexOf('installRuntimeCore(');
    expect(start).toBeGreaterThan(-1);
    expect(SRC.slice(start, start + 2500)).toMatch(/applyPetOn\(true\)/);
  });

  it('leaves the downloading phase immediately on cancel', () => {
    const cancel = SRC.indexOf("rest === 'runtime/cancel'");
    expect(cancel).toBeGreaterThan(-1);
    const tail = SRC.slice(cancel, cancel + 1200);
    expect(tail).toMatch(/cancelInstall\(\)/);
    expect(tail).toMatch(/setRuntimeState\(\{ phase: installResumePhase/);
  });

  it('keeps feeding the turn clock after the client owns mode/task', () => {
    const start = SRC.indexOf('function refreshProjectionStatus()');
    expect(start).toBeGreaterThan(-1);
    const body = SRC.slice(start, start + 600);
    expect(body).toMatch(/clientStatusSeen/);
    expect(body).toMatch(/withProjectionClock/);
  });

  it('never deletes the live runtime directory when an install is cancelled', () => {
    const start = SRC.indexOf('signal.aborted');
    expect(start).toBeGreaterThan(-1);
    expect(SRC.slice(start, start + 400)).not.toMatch(/rm\(RUNTIME_DIR/);
  });
});

import { describe, expect, it } from 'vitest';
import { createSseHub } from '../../src/host/sse.js';

function harness() {
  const chunks: string[] = [];
  const resHandlers: Record<string, () => void> = {};
  const reqHandlers: Record<string, () => void> = {};
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {},
    on(event: string, fn: () => void) {
      resHandlers[event] = fn;
      return this;
    },
  };
  const req = {
    on(event: string, fn: () => void) {
      reqHandlers[event] = fn;
      return this;
    },
    close() {
      reqHandlers.close?.();
    },
  };
  return { res, req, chunks, resHandlers, reqHandlers };
}

describe('createSseHub', () => {
  it('writes headers, the initial snapshot and broadcast frames', () => {
    const hub = createSseHub({ heartbeatMs: 60_000 });
    const { res, req, chunks } = harness();
    hub.handle(req, res, [['status', { mode: 'working' }]]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toContain('no-transform');
    expect(chunks[0]).toBe(': connected\n\n');
    expect(chunks.join('')).toContain('event: status\ndata: {"mode":"working"}');

    hub.broadcast('ui-event', { id: '1', type: 'open-settings' });
    expect(chunks.join('')).toContain('event: ui-event');
    expect(chunks.join('')).toContain('"type":"open-settings"');
    expect(hub.size).toBe(1);
  });

  it('removes a client on close', () => {
    const hub = createSseHub({ heartbeatMs: 60_000 });
    const { res, req } = harness();
    hub.handle(req, res);
    expect(hub.size).toBe(1);
    req.close();
    expect(hub.size).toBe(0);
    hub.broadcast('status', {});
    // no throw after close
    expect(true).toBe(true);
  });

  it('emits ping events so clients can prove liveness without status posts', async () => {
    const hub = createSseHub({ heartbeatMs: 20 });
    const { res, req, chunks } = harness();
    hub.handle(req, res);
    await new Promise((r) => setTimeout(r, 70));
    expect(chunks.join('')).toContain('event: ping');
    req.close();
  });

  it('closeAll ends and clears every subscriber', () => {
    const hub = createSseHub({ heartbeatMs: 60_000 });
    const a = harness();
    const b = harness();
    hub.handle(a.req, a.res);
    hub.handle(b.req, b.res);
    expect(hub.size).toBe(2);
    hub.closeAll();
    expect(hub.size).toBe(0);
  });
});

// Minimal SSE hub: one subscriber set, per-client cleanup, ping heartbeat.
// The host web-server's compression middleware skips text/event-stream.
class SseHub {
  constructor({ heartbeatMs = 15000 } = {}) {
    this.heartbeatMs = heartbeatMs;
    this.clients = new Set();
  }

  write(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      this.clients.delete(res);
      return false;
    }
  }

  broadcast(event, data) {
    for (const res of [...this.clients]) this.write(res, event, data);
  }

  handle(req, res, initial = []) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    this.clients.add(res);
    for (const [event, data] of initial) this.write(res, event, data);

    let closed = false;
    const heartbeat = setInterval(() => {
      try { res.write('event: ping\ndata: {}\n\n'); } catch { cleanup(); }
    }, this.heartbeatMs);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.clients.delete(res);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
    return cleanup;
  }

  closeAll() {
    for (const res of [...this.clients]) {
      try { res.end(); } catch { /* already gone */ }
    }
    this.clients.clear();
  }

  get size() {
    return this.clients.size;
  }
}

export function createSseHub(options) {
  return new SseHub(options);
}

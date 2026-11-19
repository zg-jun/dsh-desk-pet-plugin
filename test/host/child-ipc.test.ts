import { describe, expect, it, vi } from 'vitest';
import { createLineDecoder, encodeFrame } from '../../src/host/child-ipc.js';

describe('child-ipc', () => {
  it('round-trips and splits frames across chunks', () => {
    const onMessage = vi.fn();
    const decode = createLineDecoder(onMessage);
    const frame = encodeFrame({ type: 'ui-event', event: { type: 'open-settings' } });
    decode(frame.slice(0, 10));
    decode(frame.slice(10));
    expect(onMessage).toHaveBeenCalledWith({ type: 'ui-event', event: { type: 'open-settings' } });
  });

  it('ignores malformed and oversized buffers', () => {
    const onMessage = vi.fn();
    const decode = createLineDecoder(onMessage);
    decode('not-json\n');
    decode('x'.repeat(70 * 1024));
    decode(encodeFrame({ ok: true }));
    expect(onMessage).toHaveBeenCalledWith({ ok: true });
  });
});

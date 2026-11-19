// One-way child → Host control channel. The Electron child writes newline
// JSON frames to stdout; the Host decodes them without exposing another HTTP
// mutation path. Bounded so a runaway child cannot grow the buffer forever.

export const MAX_FRAME = 64 * 1024;

/** @param {unknown} message */
export function encodeFrame(message) {
  return `${JSON.stringify(message)}\n`;
}

/**
 * @param {(message: any) => void} onMessage
 * @returns {(chunk: string) => void}
 */
export function createLineDecoder(onMessage) {
  let buffer = '';
  return (chunk) => {
    buffer += String(chunk || '');
    if (buffer.length > MAX_FRAME) {
      buffer = '';
      return;
    }
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try { onMessage(JSON.parse(line)); } catch { /* ignore malformed frame */ }
      }
      index = buffer.indexOf('\n');
    }
  };
}

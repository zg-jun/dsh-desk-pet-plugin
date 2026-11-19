// Versioned PetSource seam. A source is a read-only, Host-registered producer
// of pet-visible status. The built-in session projection is one source; future
// subagent/task/build sources register here without changing the float.

export const PET_SOURCE_VERSION = 1;

const MODES = ['idle', 'working', 'waiting', 'done'];

/**
 * @typedef {object} PetSource
 * @property {string} id
 * @property {number} priority
 * @property {number} [ttlMs]
 * @property {(now: number) => (object | null)} read
 * @property {number} [version]
 */

/** @param {PetSource} source */
function validate(source) {
  if (!source || typeof source.id !== 'string' || !source.id.trim()) throw new Error('PetSource.id required');
  if (!Number.isFinite(source.priority)) throw new Error('PetSource.priority required');
  if (typeof source.read !== 'function') throw new Error('PetSource.read required');
  if (source.version !== undefined && source.version !== PET_SOURCE_VERSION) {
    throw new Error(`unsupported PetSource version: ${source.version}`);
  }
}

export function createSourceRegistry() {
  /** @type {PetSource[]} */
  const sources = [];
  return {
    /** @param {PetSource} source @returns {() => void} */
    register(source) {
      validate(source);
      if (sources.some((existing) => existing.id === source.id)) throw new Error(`duplicate PetSource: ${source.id}`);
      sources.push(source);
      return () => {
        const index = sources.indexOf(source);
        if (index >= 0) sources.splice(index, 1);
      };
    },
    /**
     * Highest-priority fresh source wins. A source may return null while it has
     * nothing to say; that does not block lower-priority sources.
     * @param {number} [now]
     */
    snapshot(now = Date.now()) {
      const fresh = [];
      for (const source of sources) {
        let value;
        try { value = source.read(now); } catch { value = null; }
        if (!value || typeof value !== 'object') continue;
        if (source.ttlMs !== undefined && Number.isFinite(value.updatedAt)
          && now - Number(value.updatedAt) > source.ttlMs) continue;
        fresh.push({ source, value });
      }
      fresh.sort((a, b) => b.source.priority - a.source.priority);
      if (fresh.length === 0) return null;
      const { source, value } = fresh[0];
      return {
        sourceId: source.id,
        mode: MODES.includes(value.mode) ? value.mode : 'idle',
        task: typeof value.task === 'string' ? value.task.slice(0, 120) : '',
        sessionId: typeof value.sessionId === 'string' ? value.sessionId : '',
        updatedAt: Number(value.updatedAt) || now,
      };
    },
    dispose() { sources.length = 0; },
  };
}

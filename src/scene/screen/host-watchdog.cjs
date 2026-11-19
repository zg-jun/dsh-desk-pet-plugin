// Parent-death watchdog for the floating child process.
//
// The pet is a companion of DSH: when the Host exits (normal quit or crash),
// the child must not survive as an orphan. The child is spawned detached so it
// can own a desktop window; `process.ppid` changes when the Host dies, and the
// probe catches the same condition on platforms where ppid is stale.
//
// Kept dependency-free so it can be unit-tested outside Electron.

/** @param {number} hostPid @param {number} currentPpid @param {(pid: number) => boolean} probe */
function isHostGone(hostPid, currentPpid, probe) {
  if (!hostPid) return false;
  if (currentPpid !== hostPid) return true;
  return !probe(hostPid);
}

/**
 * @param {{
 *   hostPid: number,
 *   quit: () => void,
 *   intervalMs?: number,
 *   currentPpid?: () => number,
 *   probe?: (pid: number) => boolean,
 * }} options
 * @returns {() => void} stop
 */
function createHostWatchdog({
  hostPid,
  quit,
  intervalMs = 500,
  currentPpid = () => process.ppid,
  probe = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
}) {
  if (!hostPid || typeof quit !== 'function') return () => {};
  const timer = setInterval(() => {
    if (isHostGone(hostPid, currentPpid(), probe)) quit();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

module.exports = { isHostGone, createHostWatchdog };

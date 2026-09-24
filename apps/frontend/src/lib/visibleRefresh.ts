/** Refresh only visible pages; never overlap requests or restart after cleanup. */
export function startVisibleRefresh(refresh: () => Promise<void>, intervalMs = 15_000): () => void {
  let running = false;
  let stopped = false;
  const run = async () => {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    try { await refresh(); }
    finally { running = false; }
  };
  // refresh owns its error UI; catch any unhandled rejection from a callback.
  const trigger = () => { void run().catch(() => undefined); };
  const timer = window.setInterval(trigger, intervalMs);
  document.addEventListener('visibilitychange', trigger);
  trigger();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', trigger);
  };
}

/** Wait for a visible frame to be painted, not just scheduled by React. */
export function afterVisiblePaint(callback: () => void): () => void {
  let frame = 0;
  let finished = false;
  const cancel = () => {
    finished = true;
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', schedule);
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    if (finished || document.hidden) return;
    frame = requestAnimationFrame(() => {
      if (finished || document.hidden) return;
      frame = requestAnimationFrame(() => {
        if (finished || document.hidden) return;
        cancel();
        callback();
      });
    });
  };
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return cancel;
}

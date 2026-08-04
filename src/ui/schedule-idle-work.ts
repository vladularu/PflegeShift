export function scheduleIdleWork(work: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(work, { timeout: 250 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 0);
  return () => clearTimeout(handle);
}

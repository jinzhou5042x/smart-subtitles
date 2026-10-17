// Bound UI/browser operations even if a browser API never settles.
export function withDeadline(promise, milliseconds, message, signal) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (fn, value) => { if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    const abort = () => finish(reject, signal.reason || new Error('Sign-in cancelled.'));
    const timer = setTimeout(() => finish(reject, new Error(message)), milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) abort();
  });
}

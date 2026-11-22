/** Thrown by `withTimeout` when the wrapped promise did not settle in time. */
export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer within ${ms} ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * Settle with `promise`, or reject with a `TimeoutError` after `ms`.
 *
 * A request on a dead connection does not always fail — it can simply never
 * answer. Anything that waits on the network and has a fallback uses this so
 * that "never" becomes "failed" and the fallback runs.
 *
 * The underlying request is not cancelled. That is deliberate for the cloud
 * writes this wraps: they are upserts on a primary key, so one that arrives
 * late does no harm, and one that is retried cannot duplicate.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, what = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

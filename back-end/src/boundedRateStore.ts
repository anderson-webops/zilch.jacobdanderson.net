import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit'

/** Preserve full per-identity windows; excess identities share one strict bucket. */
export class BoundedRateStore implements Store {
  readonly localKeys = true
  private windowMs = 60_000
  private readonly counters = new Map<string, ClientRateLimitInfo>()
  private overflow: ClientRateLimitInfo | undefined
  private lastTime = 0

  constructor(
    private readonly maxKeys = 2_048,
    private readonly clock = Date.now,
  ) {
    if (!Number.isSafeInteger(maxKeys) || maxKeys < 1)
      throw new RangeError('maxKeys must be a positive safe integer')
  }

  init(options: Options) {
    this.windowMs = options.windowMs
  }

  private now() {
    return (this.lastTime = Math.max(this.lastTime, this.clock()))
  }

  private prune(now: number) {
    // Entries share one window length and are inserted in expiry order.
    for (const [key, value] of this.counters) {
      if (value.resetTime!.getTime() > now)
        break
      this.counters.delete(key)
    }
    if (this.overflow && this.overflow.resetTime!.getTime() <= now)
      this.overflow = undefined
  }

  increment(key: string): ClientRateLimitInfo {
    const now = this.now()
    this.prune(now)
    let value = this.counters.get(key)
    if (!value) {
      if (this.counters.size < this.maxKeys) {
        value = { totalHits: 0, resetTime: new Date(now + this.windowMs) }
        this.counters.set(key, value)
      }
      else {
        value = this.overflow ??= { totalHits: 0, resetTime: new Date(now + this.windowMs) }
      }
    }
    value.totalHits = Math.min(Number.MAX_SAFE_INTEGER, value.totalHits + 1)
    return { ...value }
  }

  decrement(key: string) {
    this.prune(this.now())
    const value = this.counters.get(key)
    if (value)
      value.totalHits = Math.max(0, value.totalHits - 1)
    // Unknown identities may not refund the shared overflow bucket.
  }

  resetKey(key: string) {
    this.counters.delete(key)
  }

  resetAll() {
    this.counters.clear()
    this.overflow = undefined
  }

  shutdown() {
    this.resetAll()
  }
}

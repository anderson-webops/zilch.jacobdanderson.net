import type { Options } from 'express-rate-limit'
import { describe, expect, it } from 'vitest'
import { BoundedRateStore } from '../src/boundedRateStore.js'

describe('bounded rate storage', () => {
  it('preserves existing windows while excess identities share one bounded counter', () => {
    let now = 0
    const store = new BoundedRateStore(8, () => now)
    store.init({ windowMs: 60_000 } as Options)
    for (let i = 0; i < 8; i++)
      expect(store.increment(String(i)).totalHits).toBe(1)
    expect(store.increment('0').totalHits).toBe(2)
    for (let i = 0; i < 32; i++)
      expect(store.increment(`overflow-${i}`).totalHits).toBe(i + 1)
    store.decrement('not-an-existing-identity')
    expect(store.increment('new-overflow').totalHits).toBe(33)
    expect(store.increment('0').totalHits).toBe(3)
    now = 59_999
    expect(store.increment('0').resetTime?.getTime()).toBe(60_000)
    now = 60_000
    expect(store.increment('new-window').totalHits).toBe(1)
    expect(store.increment('0').totalHits).toBe(1)
    store.shutdown()
  })

  it('rejects invalid capacities and does not extend windows when the clock moves backward', () => {
    expect(() => new BoundedRateStore(0)).toThrow(RangeError)
    let now = 10_000
    const store = new BoundedRateStore(1, () => now)
    store.init({ windowMs: 1_000 } as Options)
    expect(store.increment('first').resetTime?.getTime()).toBe(11_000)
    now = 5_000
    expect(store.increment('first').resetTime?.getTime()).toBe(11_000)
    expect(store.increment('overflow').resetTime?.getTime()).toBe(11_000)
  })
})

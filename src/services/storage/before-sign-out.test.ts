import { describe, it, expect, vi } from 'vitest'
import { registerBeforeSignOut, runBeforeSignOut } from './before-sign-out'

describe('before-sign-out', () => {
  it('runs registered tasks in order and waits for async ones', async () => {
    const order: string[] = []
    const offA = registerBeforeSignOut(async () => {
      await new Promise(r => setTimeout(r, 5))
      order.push('a')
    })
    const offB = registerBeforeSignOut(() => { order.push('b') })
    await runBeforeSignOut()
    expect(order).toEqual(['a', 'b'])
    offA()
    offB()
  })

  it('does not run a task that was removed', async () => {
    const task = vi.fn()
    const off = registerBeforeSignOut(task)
    off()
    await runBeforeSignOut()
    expect(task).not.toHaveBeenCalled()
  })

  it('carries on past a task that throws or rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    const offs = [
      registerBeforeSignOut(() => { throw new Error('sync') }),
      registerBeforeSignOut(() => Promise.reject(new Error('async'))),
      registerBeforeSignOut(after),
    ]
    await expect(runBeforeSignOut()).resolves.toBeUndefined()
    expect(after).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledTimes(2)
    offs.forEach(off => off())
    error.mockRestore()
  })
})

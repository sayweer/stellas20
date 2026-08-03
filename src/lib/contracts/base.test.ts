import type { AssembledTransaction } from '@stellar/stellar-sdk/contract'
import { describe, expect, it, vi } from 'vitest'
import { invokeWrite } from './base'

vi.mock('../wallet', () => ({ signXdr: vi.fn() }))

describe('write phase safety guard', () => {
  it('does not even build when the durable building record cannot be claimed', async () => {
    const build = vi.fn()
    const result = await invokeWrite(build, 'GTEST', () => false, {})

    expect(build).not.toHaveBeenCalled()
    expect(result).toMatchObject({ code: 'transaction_safety_interrupted' })
  })

  it('does not open the wallet when persistence fails at the signing boundary', async () => {
    const signAndSend = vi.fn()
    const fakeTransaction = { signAndSend } as unknown as AssembledTransaction<unknown>
    const phases: string[] = []

    const result = await invokeWrite(
      async () => fakeTransaction,
      'GTEST',
      (phase) => {
        phases.push(phase)
        return phase !== 'signing'
      },
      {},
    )

    expect(phases).toEqual(['building', 'signing'])
    expect(signAndSend).not.toHaveBeenCalled()
    expect(result).toMatchObject({ code: 'transaction_safety_interrupted' })
  })
})

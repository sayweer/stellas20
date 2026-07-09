/** Deposit/withdraw form for the vault: validates against balance, drives the tx lifecycle via contract.ts. */
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { xlmToStroops } from '../lib/amounts'
import { depositToVault, withdrawFromVault, type TxPhase } from '../lib/contract'
import { isValidDepositAmount, isValidWithdrawAmount } from '../lib/validation'
import { useToast } from '../hooks/useToast'
import { isAppError } from '../types'
import { TxStatus, type TxOutcome } from './TxStatus'
import { Spinner } from './icons'

interface VaultActionsProps {
  address: string
  /** Connected wallet's XLM balance, or null while it's still loading. */
  walletBalanceXlm: number | null
  /** The caller's own balance recorded in the vault. */
  vaultBalanceXlm: number
  isWrongNetwork: boolean
  /** Called after a confirmed deposit/withdraw so vault state + wallet balance can refresh. */
  onSuccess: () => void
}

type Action = 'deposit' | 'withdraw'

const inputClass =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 pr-14 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono tabular-nums transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30'

export function VaultActions({
  address,
  walletBalanceXlm,
  vaultBalanceXlm,
  isWrongNetwork,
  onSuccess,
}: VaultActionsProps): ReactElement {
  const { notify } = useToast()
  const [amount, setAmount] = useState('')
  const [action, setAction] = useState<Action | null>(null)
  const [outcome, setOutcome] = useState<TxOutcome | null>(null)

  const sending = action !== null
  const depositValid = isValidDepositAmount(amount, walletBalanceXlm ?? 0).ok
  const withdrawValid = isValidWithdrawAmount(amount, vaultBalanceXlm).ok

  async function run(kind: Action): Promise<void> {
    const valid = kind === 'deposit' ? depositValid : withdrawValid
    if (!valid || sending) return

    const label = kind === 'deposit' ? 'Deposit' : 'Withdraw'
    setAction(kind)
    setOutcome({ status: 'pending', label, hash: null })

    const stroops = xlmToStroops(amount.trim())
    const onPhase = (_phase: TxPhase, hash?: string): void => {
      setOutcome({ status: 'pending', label, hash: hash ?? null })
    }

    const result =
      kind === 'deposit'
        ? await depositToVault(address, stroops, onPhase)
        : await withdrawFromVault(address, stroops, onPhase)

    setAction(null)

    if (isAppError(result)) {
      // A declined signature is the user's choice — return to idle quietly.
      if (result.code === 'user_declined') {
        setOutcome(null)
        return
      }
      setOutcome({ status: 'error', label, error: result })
      notify('error', result.message)
      return
    }

    setOutcome({ status: 'success', label, hash: result.hash })
    notify('success', `${label} confirmed.`)
    setAmount('')
    onSuccess()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6">
      <h2 className="text-sm font-medium text-neutral-400">Deposit or withdraw</h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="vault-amount" className="block text-sm font-medium text-neutral-300">
            Amount
          </label>
          <div className="relative">
            <input
              id="vault-amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
              }}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0.0"
              aria-describedby="vault-amount-hint"
              className={inputClass}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-neutral-500">
              XLM
            </span>
          </div>
          <p id="vault-amount-hint" className="text-xs text-neutral-500">
            {walletBalanceXlm === null
              ? 'Wallet balance is loading…'
              : `Spendable for deposit: ${walletBalanceXlm.toLocaleString('en-US', { maximumFractionDigits: 7 })} XLM`}
            {' · '}
            {`Available to withdraw: ${vaultBalanceXlm.toLocaleString('en-US', { maximumFractionDigits: 7 })} XLM`}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              void run('deposit')
            }}
            disabled={sending || isWrongNetwork || !depositValid}
            aria-busy={action === 'deposit'}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action === 'deposit' ? (
              <>
                <Spinner className="h-4 w-4" />
                Depositing…
              </>
            ) : (
              'Deposit'
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              void run('withdraw')
            }}
            disabled={sending || isWrongNetwork || !withdrawValid}
            aria-busy={action === 'withdraw'}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action === 'withdraw' ? (
              <>
                <Spinner className="h-4 w-4" />
                Withdrawing…
              </>
            ) : (
              'Withdraw'
            )}
          </button>
        </div>

        {isWrongNetwork && (
          <p className="text-center text-xs text-amber-300">Switch your wallet to Testnet to continue.</p>
        )}
      </form>

      {outcome && (
        <div className="mt-5">
          <TxStatus outcome={outcome} />
        </div>
      )}
    </section>
  )
}

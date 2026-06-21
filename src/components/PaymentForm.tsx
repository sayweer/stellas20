/** Send an XLM payment: validate -> build XDR -> sign (Freighter) -> submit (Horizon). */
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../hooks/useToast'
import { isValidAmount, isValidStellarAddress } from '../lib/validation'
import { buildPaymentXdr, submitSignedXdr } from '../lib/stellar'
import { signXdr } from '../lib/freighter'
import { isAppError, type AppError } from '../types'
import { TxStatus, type TxOutcome } from './TxStatus'
import { Spinner } from './icons'

interface PaymentFormProps {
  /** Available XLM balance used as the validation ceiling, or null when unknown. */
  availableBalance: number | null
  /** Called after a confirmed payment so the balance can refresh. */
  onSuccess: () => void
}

const MEMO_MAX_BYTES = 28

const inputClass =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 aria-[invalid=true]:border-rose-500/70'

export function PaymentForm({ availableBalance, onSuccess }: PaymentFormProps): ReactElement {
  const { address, networkPassphrase, isWrongNetwork } = useWallet()
  const { notify } = useToast()

  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [touched, setTouched] = useState({ destination: false, amount: false })
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<TxOutcome | null>(null)

  const max = availableBalance ?? 0
  const addressValid = isValidStellarAddress(destination)
  const amountResult = isValidAmount(amount, max)
  const memoBytes = new TextEncoder().encode(memo).length

  const destinationError =
    destination.trim() !== '' && !addressValid
      ? 'Enter a valid Stellar address (starts with G).'
      : null
  const amountError =
    amount.trim() !== '' && !amountResult.ok ? (amountResult.reason ?? 'Enter a valid amount.') : null
  const memoError =
    memoBytes > MEMO_MAX_BYTES ? `Memo is too long (${memoBytes.toString()}/${MEMO_MAX_BYTES} bytes).` : null

  const canSubmit =
    !sending && !isWrongNetwork && address !== null && addressValid && amountResult.ok && !memoError

  function fail(error: AppError): void {
    setSending(false)
    setOutcome({ status: 'error', error })
    notify('error', error.message)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setTouched({ destination: true, amount: true })
    if (address === null || !canSubmit) return

    setSending(true)
    setOutcome(null)

    const xdr = await buildPaymentXdr({
      source: address,
      destination: destination.trim(),
      amount: amount.trim(),
      memo: memo.trim() === '' ? undefined : memo.trim(),
    })
    if (isAppError(xdr)) {
      fail(xdr)
      return
    }

    const signed = await signXdr(xdr, networkPassphrase ?? '', address)
    if (isAppError(signed)) {
      // A declined signature is the user's choice — return to idle quietly.
      if (signed.code === 'user_declined' || signed.code === 'sign_declined') {
        setSending(false)
        return
      }
      fail(signed)
      return
    }

    const result = await submitSignedXdr(signed)
    setSending(false)
    if (isAppError(result)) {
      setOutcome({ status: 'error', error: result })
      notify('error', result.message)
      return
    }

    setOutcome({ status: 'success', hash: result.hash })
    notify('success', 'Payment sent.')
    setDestination('')
    setAmount('')
    setMemo('')
    setTouched({ destination: false, amount: false })
    onSuccess()
  }

  const showDestError = touched.destination && destinationError !== null
  const showAmountError = touched.amount && amountError !== null

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6">
      <h2 className="text-sm font-medium text-neutral-400">Send a payment</h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="destination" className="block text-sm font-medium text-neutral-300">
            Destination address
          </label>
          <input
            id="destination"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value)
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, destination: true }))
            }}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="G…"
            aria-invalid={showDestError ? 'true' : undefined}
            aria-describedby={showDestError ? 'destination-error' : undefined}
            className={`${inputClass} font-mono`}
          />
          {showDestError && (
            <p id="destination-error" className="text-xs text-rose-400">
              {destinationError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="amount" className="block text-sm font-medium text-neutral-300">
            Amount
          </label>
          <div className="relative">
            <input
              id="amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, amount: true }))
              }}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0.0"
              aria-invalid={showAmountError ? 'true' : undefined}
              aria-describedby={showAmountError ? 'amount-error' : 'amount-hint'}
              className={`${inputClass} pr-14 font-mono tabular-nums`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-neutral-500">
              XLM
            </span>
          </div>
          {showAmountError ? (
            <p id="amount-error" className="text-xs text-rose-400">
              {amountError}
            </p>
          ) : (
            <p id="amount-hint" className="text-xs text-neutral-500">
              {availableBalance === null
                ? 'Available balance is loading…'
                : `Available: ${availableBalance.toLocaleString('en-US', { maximumFractionDigits: 7 })} XLM`}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="memo" className="block text-sm font-medium text-neutral-300">
            Memo <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            id="memo"
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value)
            }}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. invoice #42"
            aria-invalid={memoError !== null ? 'true' : undefined}
            aria-describedby={memoError !== null ? 'memo-error' : undefined}
            className={inputClass}
          />
          {memoError !== null && (
            <p id="memo-error" className="text-xs text-rose-400">
              {memoError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={sending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <>
              <Spinner className="h-4 w-4" />
              Sending…
            </>
          ) : (
            'Send payment'
          )}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Send between two funded Testnet accounts.
        </p>

        {isWrongNetwork && (
          <p className="text-center text-xs text-amber-300">
            Switch Freighter to Testnet to send.
          </p>
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

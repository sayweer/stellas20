/** Renders a vault transaction's lifecycle: pending (hash) -> success (hash + explorer link) or a specific failure. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import type { AppError } from '../types'
import type { TxPhase } from '../lib/contracts/base'
import { isUncertainSubmission } from '../lib/txSafety'
import {
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Spinner,
  XCircleIcon,
} from './icons'

export type TxOutcome =
  | {
      status: 'pending'
      label: string
      hash: string | null
      phase: TxPhase
      transactionId?: string
    }
  | { status: 'success'; label: string; hash: string }
  | {
      status: 'error'
      label: string
      error: AppError
      hash: string | null
      phase: TxPhase
      transactionId?: string
    }

export function TxStatus({
  outcome,
  onRetry,
}: {
  outcome: TxOutcome | null
  onRetry?: () => void
}): ReactElement | null {
  const [copied, setCopied] = useState(false)
  if (!outcome) return null

  if (outcome.status === 'error') {
    const submissionUncertain = isUncertainSubmission(outcome)
    return (
      <div
        role="alert"
        className={`rounded-xl border p-4 ${
          submissionUncertain
            ? 'border-warning-500/30 bg-warning-500/10'
            : 'border-negative-500/30 bg-negative-500/10'
        }`}
      >
        <div className="flex items-start gap-3">
          <XCircleIcon
            className={`h-5 w-5 shrink-0 ${
              submissionUncertain ? 'text-warning-400' : 'text-negative-400'
            }`}
          />
          <div className="text-sm">
            <p
              className={`font-semibold ${
                submissionUncertain ? 'text-warning-100' : 'text-negative-100'
              }`}
            >
              {submissionUncertain ? 'Confirmation needs checking' : `${outcome.label} failed`}
            </p>
            <p
              className={`mt-0.5 ${
                submissionUncertain ? 'text-warning-200/80' : 'text-negative-200/80'
              }`}
            >
              {outcome.error.message}
            </p>
            <p
              className={`mt-2 text-xs ${
                submissionUncertain ? 'text-warning-200/80' : 'text-negative-200/80'
              }`}
            >
              {submissionUncertain
                ? outcome.hash
                  ? 'The transaction was submitted, but Everspan could not verify its final status. Do not submit it again until you check the transaction below.'
                  : 'Submission may have started, but Everspan did not receive a transaction hash or final status. Check your wallet activity before trying again.'
                : 'Everspan did not receive a transaction hash. Your entered values are still available above.'}
            </p>
            {submissionUncertain && outcome.hash ? (
              <div className="mt-3">
                <code className="block break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-warning-100">
                  {outcome.hash}
                </code>
                <a
                  href={explorerTxUrl(outcome.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded font-medium text-warning-100 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
                >
                  Check on Stellar Expert
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : !submissionUncertain && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-negative-300 px-3 py-2 text-xs font-semibold text-negative-100 transition-colors duration-100 hover:bg-negative-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative-300"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (outcome.status === 'pending') {
    return (
      <div role="status" className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
        <div className="flex items-start gap-3">
          <Spinner className="h-5 w-5 shrink-0 text-warning-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-warning-100">{pendingTitle(outcome.phase)}</p>
            <p className="mt-0.5 text-warning-200/80">{pendingDetail(outcome.phase)}</p>
            <ol aria-label="Transaction progress" className="mt-4 grid grid-cols-3 gap-2">
              <ProgressStep label="Prepare" state={stepState(outcome.phase, 'building')} />
              <ProgressStep label="Approve" state={stepState(outcome.phase, 'signing')} />
              <ProgressStep label="Confirm" state={stepState(outcome.phase, 'pending')} />
            </ol>
            {outcome.hash && (
              <code
                aria-hidden="true"
                className="mt-3 block break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-warning-100"
              >
                {outcome.hash}
              </code>
            )}
          </div>
        </div>
      </div>
    )
  }

  const { hash, label } = outcome
  const explorerUrl = explorerTxUrl(hash)

  async function copyHash(): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch {
      /* clipboard unavailable — the hash is still visible to copy manually */
    }
  }

  return (
    <div role="status" className="rounded-xl border border-positive-500/30 bg-positive-500/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-positive-400" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-positive-100">{label} confirmed</p>
          <p className="mt-0.5 text-positive-200/80">
            Stellar confirmed the transaction on Testnet. Your balances will update automatically.
          </p>

          {/* invokeWrite falls back to an empty hash when the RPC response
              carries none. Rendering it anyway produced an empty code block and
              an explorer link that goes nowhere. */}
          {hash !== '' && (
            <>
              <div className="mt-3">
                <span className="text-xs font-medium uppercase tracking-wide text-positive-200/60">
                  Transaction hash
                </span>
                <div className="mt-1 flex items-start gap-2">
                  <code
                    aria-hidden="true"
                    className="min-w-0 flex-1 break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-positive-100"
                  >
                    {hash}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void copyHash()
                    }}
                    aria-label={copied ? 'Hash copied' : 'Copy transaction hash'}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-positive-300 text-positive-300 transition-colors hover:bg-positive-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-positive-300"
                  >
                    {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                  </button>
                  <span role="status" aria-live="polite" className="sr-only">
                    {copied ? 'Transaction hash copied.' : ''}
                  </span>
                </div>
              </div>

              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded font-medium text-positive-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-positive-300"
              >
                View on Stellar Expert
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const PHASE_ORDER: TxPhase[] = ['building', 'signing', 'pending']

function stepState(current: TxPhase, step: TxPhase): 'done' | 'active' | 'next' {
  const currentIndex = PHASE_ORDER.indexOf(current)
  const stepIndex = PHASE_ORDER.indexOf(step)
  if (stepIndex < currentIndex) return 'done'
  if (stepIndex === currentIndex) return 'active'
  return 'next'
}

function ProgressStep({
  label,
  state,
}: {
  label: string
  state: 'done' | 'active' | 'next'
}): ReactElement {
  return (
    <li className="min-w-0">
      <span
        aria-hidden="true"
        className={`mb-1.5 block h-1 rounded-full ${
          state === 'done'
            ? 'bg-positive-400'
            : state === 'active'
              ? 'bg-warning-400'
              : 'bg-neutral-800'
        }`}
      />
      <span className={`text-[11px] ${state === 'next' ? 'text-neutral-500' : 'text-warning-100'}`}>
        {state === 'done' ? '✓ ' : ''}
        {label}
      </span>
    </li>
  )
}

function pendingTitle(phase: TxPhase): string {
  if (phase === 'building') return 'Preparing transaction'
  if (phase === 'signing') return 'Approve in your wallet'
  return 'Confirming on Stellar'
}

function pendingDetail(phase: TxPhase): string {
  if (phase === 'building') return 'Checking the latest state and expected result before signing.'
  if (phase === 'signing')
    return 'Review the request in your wallet. You can cancel without moving funds.'
  return 'The transaction was submitted. Keep this page open while Stellar confirms it.'
}

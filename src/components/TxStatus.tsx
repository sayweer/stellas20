/** Renders a vault transaction's lifecycle: pending (hash) -> success (hash + explorer link) or a specific failure. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import type { AppError } from '../types'
import { CheckCircleIcon, CheckIcon, CopyIcon, ExternalLinkIcon, Spinner, XCircleIcon } from './icons'

export type TxOutcome =
  | { status: 'pending'; label: string; hash: string | null }
  | { status: 'success'; label: string; hash: string }
  | { status: 'error'; label: string; error: AppError }

export function TxStatus({ outcome }: { outcome: TxOutcome | null }): ReactElement | null {
  const [copied, setCopied] = useState(false)
  if (!outcome) return null

  if (outcome.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
        <div className="flex items-start gap-3">
          <XCircleIcon className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-sm">
            <p className="font-semibold text-rose-100">{outcome.label} failed</p>
            <p className="mt-0.5 text-rose-200/80">{outcome.error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  if (outcome.status === 'pending') {
    return (
      <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <Spinner className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-amber-100">{outcome.label} pending…</p>
            <p className="mt-0.5 text-amber-200/70">Waiting for the network to confirm your transaction.</p>
            {outcome.hash && (
              <code
                aria-hidden="true"
                className="mt-3 block break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-amber-100"
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
    <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-emerald-100">{label} sent</p>
          <p className="mt-0.5 text-emerald-200/70">Your transaction was confirmed on Testnet.</p>

          <div className="mt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-emerald-200/60">
              Transaction hash
            </span>
            <div className="mt-1 flex items-start gap-2">
              <code
                aria-hidden="true"
                className="min-w-0 flex-1 break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-emerald-100"
              >
                {hash}
              </code>
              <button
                type="button"
                onClick={() => {
                  void copyHash()
                }}
                aria-label={copied ? 'Hash copied' : 'Copy transaction hash'}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-500/30 text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded font-medium text-emerald-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            View on Stellar Expert
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

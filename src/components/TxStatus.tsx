/** Renders the outcome of a payment: success (hash + explorer link) or a specific failure. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { config } from '../config'
import type { AppError } from '../types'
import { CheckCircleIcon, CheckIcon, CopyIcon, ExternalLinkIcon, XCircleIcon } from './icons'

export type TxOutcome =
  | { status: 'success'; hash: string }
  | { status: 'error'; error: AppError }

export function TxStatus({ outcome }: { outcome: TxOutcome | null }): ReactElement | null {
  const [copied, setCopied] = useState(false)
  if (!outcome) return null

  if (outcome.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
        <div className="flex items-start gap-3">
          <XCircleIcon className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-sm">
            <p className="font-semibold text-rose-100">Payment failed</p>
            <p className="mt-0.5 text-rose-200/80">{outcome.error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  const { hash } = outcome
  const explorerUrl = `${config.stellarExpertUrl}/tx/${hash}`

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
          <p className="font-semibold text-emerald-100">Payment sent</p>
          <p className="mt-0.5 text-emerald-200/70">Your transaction was submitted to Testnet.</p>

          <div className="mt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-emerald-200/60">
              Transaction hash
            </span>
            <div className="mt-1 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-neutral-950/60 px-2 py-1.5 font-mono text-xs leading-relaxed text-emerald-100">
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

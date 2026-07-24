/** Portfolio tab: balances summary, per-maturity positions, and LP positions. */
import type { ReactElement } from 'react'
import type { Portfolio } from '../hooks/usePortfolio'
import type { MaturityPool } from '../hooks/usePools'
import type { AppError } from '../types'
import { PortfolioPanel } from './PortfolioPanel'
import { MaturityPanel } from './MaturityPanel'
import { LpPositions } from './LpPositions'

interface PortfolioViewProps {
  address: string
  portfolio: Portfolio
  pools: MaturityPool[]
  loading: boolean
  error: AppError | null
  liveRate: bigint | null
  isWrongNetwork: boolean
  onRefresh: () => void
  onManagePool: (maturity: bigint) => void
}

export function PortfolioView({
  address,
  portfolio,
  pools,
  loading,
  error,
  liveRate,
  isWrongNetwork,
  onRefresh,
  onManagePool,
}: PortfolioViewProps): ReactElement {
  return (
    <div
      id="panel-portfolio"
      role="tabpanel"
      aria-labelledby="tab-portfolio"
      className="space-y-6"
    >
      <PortfolioPanel
        address={address}
        portfolio={portfolio}
        loading={loading}
        error={error}
        liveRate={liveRate}
        onRefresh={onRefresh}
      />
      <MaturityPanel
        address={address}
        positions={portfolio.positions}
        rateInfo={portfolio.rateInfo}
        isWrongNetwork={isWrongNetwork}
        onSuccess={onRefresh}
      />
      <LpPositions pools={pools} onManage={onManagePool} />
    </div>
  )
}

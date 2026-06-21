/* eslint-disable react-refresh/only-export-components --
   The provider and its useWallet hook are intentionally colocated in this module;
   the Fast Refresh boundary tradeoff is acceptable for a stable context. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  connect as freighterConnect,
  getActiveAddress,
  getNetwork as freighterGetNetwork,
  isAllowed,
  isFreighterInstalled,
} from '../lib/freighter'
import { isAppError, type AppError, type WalletState } from '../types'

/** Freighter's network name for Stellar Testnet. */
const TESTNET_NETWORK = 'TESTNET'

const INITIAL_STATE: WalletState = {
  status: 'disconnected',
  address: null,
  network: null,
  networkPassphrase: null,
}

/** Wallet state plus actions and derived flags exposed to the app. */
export interface WalletContextValue extends WalletState {
  /** True when an account is connected. */
  isConnected: boolean
  /** True when connected but not on Stellar Testnet (should block sending). */
  isWrongNetwork: boolean
  /** Run the Freighter connection flow. Resolves to an AppError on failure, or null on success. */
  connect: () => Promise<AppError | null>
  /** Clear local connection state (Freighter exposes no disconnect API). */
  disconnect: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

/** Provides wallet connection state and actions to the tree. */
export function WalletProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<WalletState>(INITIAL_STATE)

  // Restore an existing session on mount so a page refresh stays connected.
  useEffect(() => {
    let cancelled = false
    async function restore(): Promise<void> {
      if (!(await isFreighterInstalled())) return
      if (!(await isAllowed())) return
      const address = await getActiveAddress()
      if (!address || cancelled) return
      const net = await freighterGetNetwork()
      if (cancelled) return
      setState({
        status: 'connected',
        address,
        network: isAppError(net) ? null : net.network,
        networkPassphrase: isAppError(net) ? null : net.networkPassphrase,
      })
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async (): Promise<AppError | null> => {
    setState((prev) => ({ ...prev, status: 'connecting' }))
    const result = await freighterConnect()
    if (isAppError(result)) {
      setState(INITIAL_STATE)
      return result
    }
    setState({
      status: 'connected',
      address: result.address,
      network: result.network,
      networkPassphrase: result.networkPassphrase,
    })
    return null
  }, [])

  const disconnect = useCallback((): void => {
    setState(INITIAL_STATE)
  }, [])

  const value = useMemo<WalletContextValue>(() => {
    const isConnected = state.status === 'connected' && state.address !== null
    return {
      ...state,
      isConnected,
      isWrongNetwork: isConnected && state.network !== TESTNET_NETWORK,
      connect,
      disconnect,
    }
  }, [state, connect, disconnect])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

/** Access wallet state + actions. Throws if used outside a WalletProvider. */
export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (ctx === null) {
    throw new Error('useWallet must be used within a <WalletProvider>.')
  }
  return ctx
}

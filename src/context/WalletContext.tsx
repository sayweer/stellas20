/* eslint-disable react-refresh/only-export-components --
   The provider and its useWallet hook are intentionally colocated in this module;
   the Fast Refresh boundary tradeoff is acceptable for a stable context. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { config } from '../config'
import { disconnectWallet, getWalletNetwork, onWalletAddressChange, openWalletPicker } from '../lib/wallet'
import { isAppError, type AppError, type WalletState } from '../types'

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
  /** Open the multi-wallet picker. Resolves to an AppError on failure, or null on success. */
  connect: () => Promise<AppError | null>
  /** Clear the wallet connection (kit exposes no server-side disconnect). */
  disconnect: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

/** Provides wallet connection state and actions to the tree. */
export function WalletProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<WalletState>(INITIAL_STATE)

  // The kit fires this immediately with its persisted address (restoring a
  // session across reloads with no popup), then again on every
  // connect/disconnect/account switch — this is the single source of truth
  // for `address`.
  useEffect(() => {
    const unsubscribe = onWalletAddressChange((address) => {
      if (!address) {
        setState(INITIAL_STATE)
        return
      }
      setState((prev) => ({ ...prev, status: 'connected', address, network: null, networkPassphrase: null }))
      void getWalletNetwork().then((net) => {
        setState((prev) =>
          prev.address === address
            ? { ...prev, network: net?.network ?? null, networkPassphrase: net?.networkPassphrase ?? null }
            : prev,
        )
      })
    })
    return unsubscribe
  }, [])

  const connect = useCallback(async (): Promise<AppError | null> => {
    setState((prev) => ({ ...prev, status: 'connecting' }))
    const result = await openWalletPicker()
    if (isAppError(result)) {
      // Success is applied by the onWalletAddressChange subscription above;
      // on failure, only reset if we're still mid-connect (no address landed).
      setState((prev) => (prev.status === 'connecting' ? INITIAL_STATE : prev))
      return result
    }
    return null
  }, [])

  const disconnect = useCallback((): void => {
    disconnectWallet()
    setState(INITIAL_STATE)
  }, [])

  const value = useMemo<WalletContextValue>(() => {
    const isConnected = state.status === 'connected' && state.address !== null
    return {
      ...state,
      isConnected,
      isWrongNetwork:
        isConnected && state.networkPassphrase !== null && state.networkPassphrase !== config.networkPassphrase,
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

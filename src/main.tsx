import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { config } from './config.ts'
import { LandingRoute } from './routes/LandingRoute.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { WalletProvider } from './context/WalletContext.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { TransactionSafetyProvider } from './context/TransactionSafetyContext.tsx'
import { TransactionSafetyBanner } from './components/TransactionSafetyBanner.tsx'
import { Toast } from './components/Toast.tsx'

if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn })
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ThemeProvider>
          <TransactionSafetyProvider>
            {/* The wallet provider wraps both routes so a session restored while
                reading the marketing page is already connected on /app. */}
            <WalletProvider>
              <BrowserRouter>
                <TransactionSafetyBanner />
                <Routes>
                  <Route path="/" element={<LandingRoute />} />
                  <Route path="/app" element={<App />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <Toast />
              </BrowserRouter>
            </WalletProvider>
          </TransactionSafetyProvider>
        </ThemeProvider>
      </ToastProvider>
    </ErrorBoundary>
    <Analytics />
  </StrictMode>,
)

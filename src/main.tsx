import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { config } from './config.ts'
import { Landing } from './routes/Landing.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { WalletProvider } from './context/WalletContext.tsx'

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
        {/* The wallet provider wraps both routes so a session restored while
            reading the marketing page is already connected on /app. */}
        <WalletProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<App />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </ToastProvider>
    </ErrorBoundary>
    <Analytics />
  </StrictMode>,
)

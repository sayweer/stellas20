# CLAUDE.md — Stellar White Belt Payment dApp

## What this project is
A small, production-quality frontend dApp for the Stellar "Journey to Mastery" — White Belt (Level 1) submission. It connects the Freighter wallet on Stellar Testnet, shows the account's XLM balance, and sends an XLM payment with clear success/failure feedback. Scope is intentionally small; clean architecture, correctness, and error handling are what matter.

## Non-negotiable requirements (Level 1 acceptance)
1. Connect to the Freighter browser extension; use Stellar Testnet only.
2. Wallet connect AND disconnect.
3. Fetch the connected account's native XLM balance and display it clearly.
4. Send an XLM payment on Testnet and show the user success/failure plus the transaction hash.
5. Solid error handling across wallet, network, balance, and transaction flows.

## Tech stack (do not change without asking)
- Vite + React 18 + TypeScript (strict). Client-only SPA, no SSR.
- Tailwind CSS.
- @stellar/freighter-api for wallet connection + signing.
- @stellar/stellar-sdk for Horizon queries + transaction building.
- No state-management library; React Context + hooks. Keep dependencies minimal; do not add a UI kit without asking.

## Architecture & conventions
- src/lib/ : pure framework-agnostic services (Stellar/Freighter/validation). No React here.
- src/context/ : React providers (wallet connection state).
- src/hooks/ : reusable hooks (balance, toast).
- src/components/ : presentational + small container components.
- src/config.ts : all env + constants in one place.
- src/types/ : shared TypeScript types.
- TypeScript strict; avoid `any` (justify with a comment if unavoidable). Explicit return types on exported functions.
- Functional components + hooks only.
- Services never throw raw library errors to the UI — wrap and normalize into friendly, specific messages.
- All user-facing strings in English. Accessible UI (labelled inputs, discernible button text, keyboard usable, good contrast). No leftover console.log in committed code.

## Stellar / Freighter technical reference (VERIFIED — use exactly this API)
Versions move fast. These match @stellar/freighter-api v5.x and current @stellar/stellar-sdk (mid-2026). Before writing wallet code, run `npm ls @stellar/freighter-api @stellar/stellar-sdk`; if the installed package's types differ, trust the installed types and flag the difference.

### Freighter (@stellar/freighter-api)
All methods are async and may return `{ ..., error }`. Always check `error` first.
- isConnected() -> { isConnected: boolean }  // is the extension installed/available
- isAllowed() -> { isAllowed: boolean }       // has the user authorized this app
- requestAccess() -> { address, error? }      // triggers connect popup; use for "Connect"
- setAllowed() -> { isAllowed, error? }        // part of the connection flow
- getAddress() -> { address, error? }          // current public key (after access granted)
- getNetworkDetails() -> { network, networkUrl, networkPassphrase, sorobanRpcUrl, error? }
- signTransaction(xdr, { networkPassphrase, address }) -> { signedTxXdr, signerAddress, error? }
Notes: Freighter v5 blocks signing unless the app went through the connection flow (requestAccess/setAllowed). There is no true "disconnect" API — implement disconnect by clearing this app's stored connection state.

### Stellar SDK (@stellar/stellar-sdk)
import { Horizon, Asset, TransactionBuilder, Operation, Networks, BASE_FEE, Memo, StrKey } from "@stellar/stellar-sdk";
const server = new Horizon.Server(HORIZON_URL); // https://horizon-testnet.stellar.org
- Balance: const acc = await server.loadAccount(publicKey); then acc.balances.find(b => b.asset_type === "native").balance. If loadAccount 404s, the account is UNFUNDED -> surface a "fund with Friendbot" path.
- Fee: const fee = (await server.fetchBaseFee()).toString(); (or BASE_FEE).
- Build payment:
    const account = await server.loadAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, { fee, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount }))
      .addMemo(Memo.text(memo))   // optional
      .setTimeout(180)
      .build();
    const xdr = tx.toXDR();
- Sign via Freighter, then rebuild + submit:
    const signed = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
    const res = await server.submitTransaction(signed);
    const hash = res.hash;
- Error normalization: on submit failure read err.response?.data?.extras?.result_codes (e.g. op_underfunded, op_no_destination, tx_bad_seq) and map to friendly messages.
- Validate address: StrKey.isValidEd25519PublicKey(addr).
- Amounts are strings, up to 7 decimals. Validate amount > 0 and that the source keeps headroom for fee + base reserve (~1.5 XLM).
- Sending to a NON-EXISTENT account fails (op_no_destination). For Level 1, send between two FUNDED Testnet accounts. (Optional: branch to Operation.createAccount when the destination doesn't exist.)

### Friendbot (testnet funding)
GET https://friendbot.stellar.org/?addr=PUBLIC_KEY funds a new testnet account with 10,000 XLM, once per account. Handle "already funded" gracefully.

### Constants
- Horizon (testnet): https://horizon-testnet.stellar.org
- Network passphrase (testnet): Networks.TESTNET = "Test SDF Network ; September 2015"
- Friendbot: https://friendbot.stellar.org

## Security & guardrails
- NEVER handle, request, store, or log private keys/secrets. Signing happens only inside Freighter.
- No secrets in the repo. .env is gitignored; only VITE_-prefixed non-secret config is used (it ships to the client).
- Validate and sanitize all inputs before building transactions.
- Testnet only. Do not add mainnet config.

## Commands
- npm run dev / npm run build / npm run preview / npm run lint

## Definition of Done
- [ ] Freighter detected; clear message + install link if missing.
- [ ] Connect goes through requestAccess; truncated address shown in the UI.
- [ ] Disconnect clears app state; UI returns to disconnected.
- [ ] Network guard: if not on Testnet, a visible banner blocks sending.
- [ ] Balance fetched from Horizon and clearly displayed; refresh works; unfunded account shows Friendbot path.
- [ ] Payment form validates destination (StrKey) and amount (>0, within balance).
- [ ] Successful payment shows success state + tx hash with a stellar.expert testnet link.
- [ ] Failed payment shows a friendly, specific error.
- [ ] No secrets in code; no leftover console logs; `npm run build` passes with no type errors.
- [ ] README complete with the 4 required screenshots.

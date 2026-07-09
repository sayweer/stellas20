# stellas-vault — Yellow Belt Crowdfunding Vault

A Soroban crowdfunding-vault dApp for **Stellar Testnet**: a smart contract that accepts XLM deposits toward a funding goal and lets contributors withdraw their own balance, paired with a multi-wallet frontend that reads and writes the contract live, tracks every transaction's status, and streams a real-time activity feed from the contract's own events. This is the **Yellow Belt (Level 2)** submission for the Stellar *Journey to Mastery* program, evolving in place from the [White Belt payment dApp](#-belt-history) submitted earlier in this same repository.

> **Testnet only.** This app never touches mainnet. Signing always happens inside your connected wallet — this app never sees your secret key.

## Features

Mapped to the Level 2 requirements:

- **Multi-wallet connect** via [StellarWalletsKit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) — pick Freighter, xBull, or Albedo (no install needed) from a picker modal; connect/disconnect, with the session restored automatically on reload.
- **Smart contract deployed on Testnet** — a Rust/Soroban vault contract with `initialize`, `deposit`, `withdraw`, and read-only views, unit-tested (8 tests) and built with the `stellar` CLI.
- **Contract calls from the frontend, read AND write** — the funding pot's total/goal/contributor-count/your-balance are free simulate-only reads (work even while disconnected); deposit/withdraw are full build → simulate → sign → submit → confirm writes.
- **Event listening / live state sync** — an activity feed polls the contract's `deposit`/`withdraw` events every 5s and updates the funding-pot totals in near-real-time, without a manual refresh.
- **Transaction status tracking** — every deposit/withdraw visibly moves through **pending** (with hash) → **success** (hash + stellar.expert link) or a **specific failure reason**.
- **3+ distinct, visibly-handled error types**: wallet not available, user declined the connection/signature, insufficient balance (both a client-side pre-check and the contract's own `#[contracterror]` mapped to a friendly message) — plus a bonus wrong-network guard that blocks sending.

## Tech stack

- **Frontend**: [Vite](https://vite.dev/) + React 19 + TypeScript (strict), [Tailwind CSS](https://tailwindcss.com/)
- **Wallet**: [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (Freighter, xBull, Albedo modules) behind a thin adapter (`src/lib/wallet.ts`)
- **Chain**: [`@stellar/stellar-sdk`](https://github.com/stellar/js-stellar-sdk) — Horizon (wallet XLM balance), `/rpc` and `/contract` (Soroban reads/writes/events) via the official `Client`/`AssembledTransaction` pipeline
- **Contract**: Rust + [`soroban-sdk`](https://crates.io/crates/soroban-sdk) `27.0.0`, built and deployed with the `stellar` CLI `27.0.0`
- **ESLint + Prettier** — linting and formatting

## Prerequisites

**Frontend:**
- **Node.js 20.19+ or 22.12+** (required by Vite 8) and npm.
- A Stellar Testnet wallet: **[Freighter](https://www.freighter.app/)**, **[xBull](https://xbull.app/)**, or nothing at all — **[Albedo](https://albedo.link/)** works from the picker with no install.
- A **funded Testnet account**. Fund one in-app with **Fund with Friendbot**, or directly via [https://friendbot.stellar.org](https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY).

**Contract (only if you want to rebuild/redeploy it yourself):**
- Rust + `cargo`, with the `wasm32v1-none` target: `rustup target add wasm32v1-none`
- The [`stellar` CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli) `27.x`

## Setup / run locally

No secrets or API keys are required — the app is Testnet-only and reads non-secret configuration from `VITE_`-prefixed environment variables. A vault is already deployed on Testnet (see [Deployed contract](#deployed-contract) below), so you can run the frontend against it immediately.

```bash
# 1. Clone the repository
git clone <repository-url>
cd stellas20

# 2. Install dependencies
npm install

# 3. Create your local env file (already points at the deployed vault + Testnet defaults)
cp .env.example .env

# 4. Start the dev server
npm run dev
```

Then open the printed URL (default **http://localhost:5173**).

**Available scripts:**

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format the codebase with Prettier |
| `cargo test` | Run the contract's unit tests (from repo root) |
| `stellar contract build` | Build the contract to WASM (from repo root) |

## Deployed contract

| | |
| --- | --- |
| **Contract ID (Testnet)** | `CDUMZWQZID4WCIQ5U3QBILM2A4H5GEYXPBTVSUM6EUWUR5AZB5GVVTSZ` |
| **Token (native XLM SAC)** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Goal** | 1,000 XLM |
| **Deploy tx** | [`d441922d…2b75`](https://stellar.expert/explorer/testnet/tx/d441922dc8cb22727676f7ea562284d1bed89c4afd5d6fc4f13c8034eb242b75) |
| **Initialize tx** | [`30c76170…3a`](https://stellar.expert/explorer/testnet/tx/30c76170eb7e41ac5423ae1abc15569660e11720ae2adef55da514638105363a) |
| **Deposit tx (from this frontend)** | [`cbdfc98d…49e`](https://stellar.expert/explorer/testnet/tx/cbdfc98d7c810b3ed349b97e28d705e67e78fc1ef687b03a5d59aa06bb1349e) |

Rebuild and redeploy your own instance:

```bash
stellar keys generate vault-admin --network testnet --fund
cargo test && stellar contract build
stellar contract id asset --asset native --network testnet   # confirm the native SAC id for your network
stellar contract deploy --wasm target/wasm32v1-none/release/stellas_vault.wasm \
  --source vault-admin --network testnet --alias stellas-vault
stellar contract invoke --id stellas-vault --source vault-admin --network testnet -- \
  initialize --admin <ADMIN_G...> --goal 10000000000 --token <NATIVE_SAC_C...>
```

Then update `VITE_VAULT_CONTRACT_ID` (and `VITE_NATIVE_SAC_ID` if it differs) in your `.env`.

> **Testnet resets periodically.** If the contract ID above no longer resolves, redeploy with the steps above and update your `.env`.

## Contract design

Rust / `soroban-sdk`, in `contracts/vault/src/lib.rs`:

- `initialize(admin, goal, token)` — one-time setup; rejects a second call (`AlreadyInitialized`).
- `deposit(from, amount)` — `from.require_auth()`; transfers `amount` of `token` from `from` into the vault; updates the per-user balance, running total, and contributor count; publishes a `Deposit` event.
- `withdraw(to, amount)` — `to.require_auth()`; pays out up to `to`'s own recorded balance (rejects with `InsufficientBalance` otherwise); publishes a `Withdraw` event. The contract has no admin backdoor into user funds.
- `get_total`, `get_goal`, `get_contributors`, `get_balance(addr)` — free read-only views.
- Storage: instance storage for config/aggregates, persistent storage per-user balance, with TTL extended on every mutation.
- 8 unit tests: init, double-init rejection, deposit/withdraw happy paths, withdraw-exceeds-balance rejection, invalid-amount rejection, events published, auth required.

## How to use

1. Click **Connect Wallet** (top right) and pick Freighter, xBull, or Albedo from the picker.
2. The **funding pot** (goal, total raised, progress bar, contributor count) is visible immediately — it works even before you connect.
3. Once connected, your XLM balance appears; unfunded accounts get a **Fund with Friendbot** button.
4. In **Deposit or withdraw**, enter an amount and click **Deposit** (from your wallet into the vault) or **Withdraw** (your own vault balance back to your wallet).
5. Watch the transaction move from **pending** (with hash) to **success** (hash + Stellar Expert link) or a specific error.
6. The **Activity** feed below updates automatically as deposits/withdrawals happen — yours or anyone else's.

## Error handling

| # | Error | Where it's triggered | What the UI shows |
| --- | --- | --- | --- |
| 1 | Wallet not available | Picking an uninstalled wallet in the modal (or signing while disconnected mid-session) | The picker marks uninstalled wallets with an install link; a fallback message points to Freighter |
| 2 | User declined | Closing the wallet picker, or rejecting a signature request | A calm, non-error message — the UI just returns to idle |
| 3 | Insufficient balance | Withdrawing more than your recorded vault balance | Inline: the **Withdraw** button disables itself, backed by the contract's own `InsufficientBalance` error if ever bypassed |
| 4 (bonus) | Wrong network | Connected wallet isn't on Testnet | A blocking banner; deposit/withdraw are disabled |
| — | Account not funded, simulation/contract failure, network timeout | RPC/tx pipeline | A specific message in the transaction status card |

## Screenshots

Deferred until the Level 3 (Orange Belt) submission checkpoint, since development continues past this point in the same repository. At that point, add here (and to `screenshots/`, alongside the White Belt screenshots kept for that submission's record):

| | |
| --- | --- |
| **Wallet picker** | **Funding pot / vault** |
| ![Wallet picker](screenshots/wallet-options.png) | ![Funding pot](screenshots/funding-pot.png) |
| **Successful deposit** | |
| ![Successful deposit](screenshots/deposit-success.png) | |

## Project structure

```
contracts/
└── vault/
    ├── src/lib.rs        # Contract: initialize, deposit, withdraw, views, events
    └── src/test.rs       # 8 unit tests
src/
├── components/           # FundingPot, VaultActions, ActivityFeed, TxStatus,
│                         # WalletButton, NetworkBanner, BalanceCard, Header, Toast, icons
├── context/              # WalletContext (StellarWalletsKit-backed), ToastContext
├── hooks/                # useVaultState, useVaultEvents, useBalance, useToast
├── lib/                  # Framework-agnostic services (no React):
│                         # wallet (kit adapter), contract (reads/writes), events
│                         # (getEvents polling), amounts (stroop math), stellar
│                         # (Horizon balance), validation, friendbot
├── types/                # Shared TypeScript types
├── config.ts             # Env + constants (Testnet only)
├── App.tsx                # Layout composition
├── main.tsx               # Entry point + providers
└── index.css              # Tailwind directives + dark base theme
```

Contract methods are invoked via the official `@stellar/stellar-sdk/contract` `Client`, which fetches the on-chain spec directly — no generated bindings package needed. Components never import the wallet kit or the Soroban SDK directly, only through `lib/wallet.ts` and `lib/contract.ts`.

## Notes

- **Testnet only.** There is no mainnet configuration, by design.
- **Your keys stay in your wallet.** This app never requests, stores, or logs private keys or secrets — signing happens entirely inside the connected wallet extension.
- **No secrets in the repo.** `.env` is gitignored; only non-secret `VITE_`-prefixed values (Horizon, Friendbot, Soroban RPC, explorer, and contract IDs) ship to the client, with Testnet defaults baked in.
- **No admin backdoor.** The vault contract can only ever pay a withdrawal to the address that authorized it, for its own recorded balance.

## Belt history

- **White Belt (Level 1)** — Freighter connect, XLM balance, a single payment form. That code lives on in this repo's git history; its screenshots stay in `screenshots/` as the submission record.
- **Yellow Belt (Level 2, this submission)** — the payment form was replaced by the crowdfunding vault above, evolved in place in the same repository.

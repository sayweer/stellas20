# Deployment and wallets

How a full deployment is produced from a clean machine, and what it takes to reach a
wallet from a phone. Operational procedures live in [`RUNBOOKS.md`](RUNBOOKS.md).

## Deployment workflow

```bash
stellar keys generate vault-admin --network testnet --fund
./scripts/deploy-testnet.sh                # mUSDY market
./scripts/deploy-testnet.sh --with-blend   # ...plus a second market over a real Blend pool
# prints VITE_MYT_ / VITE_SY_VAULT_ / VITE_SPLITTER_ / VITE_AMM_CONTRACT_ID
#     (+ VITE_BLEND_* with --with-blend)
./scripts/seed-liquidity.sh <maturity-unix> [target-apy]   # seed a pool at a fixed APY
# Blend pools: SOURCE=blend SY_ID=sy-vault-blend SPLITTER_ID=splitter-blend \
#              AMM_ID=pt-amm-blend ./scripts/seed-liquidity.sh <maturity-unix>
```

`deploy-testnet.sh` builds everything, uploads the PT/YT token WASM, deploys the four core
contracts in dependency order (constructor-initialized, so nothing can be front-run), then creates
the demo maturities and their empty PT/SY pools. `seed-liquidity.sh` derives the fair PT price for
a target implied APY and seeds a pool. `--with-blend` additionally deploys `sy-vault-blend` over the
Blend pool named in the script (a constructor argument, never hardcoded in a contract) plus its own
Market and AMM. Paste the printed IDs into `.env`, `.env.example`, and your Vercel project's
environment variables; leaving the `VITE_BLEND_*` values empty ships a mock-only build and the
market switcher hides itself.

The frontend deploys to **Vercel via its GitHub integration**: import the repo (Vite is
auto-detected, no build config needed), and once connected Vercel auto-deploys on every push to
`main`. Contract deployment stays a documented local workflow — the admin key lives only in the
local `stellar keys` store, never in CI secrets.

## Connecting from a phone

Browser-extension wallets cannot inject into a mobile browser, so Freighter, xBull and LOBSTR are
unreachable there. Freighter's kit module makes this explicit — it returns `isAvailable() === false`
when it detects its own mobile build, [with a comment saying WalletConnect must be used
instead](https://github.com/Creit-Tech/Stellar-Wallets-Kit). Left unhandled, the picker offers an
**Install** link to someone who already has the app, which opens the app store and changes nothing —
so on a phone those modules are not registered at all. (The kit's own
`authModal.hideUnsupportedWallets` flag cannot do this in 2.5.0: the setting is stored but the picker
never reads it.) A wallet app's in-app browser does inject a provider, and keeps the full list.

Two ways through:

- **Albedo** works in any browser (web popup, nothing to install) and is in the picker already.
- **WalletConnect** reaches the real mobile apps, including Freighter mobile — inside Freighter's
  in-app browser it takes over the picker and connects directly. It needs a free project id from
  [reown.com](https://dashboard.reown.com): set `VITE_WALLETCONNECT_PROJECT_ID` and the module is
  added automatically. Its ~400 kB is loaded dynamically and only on a phone, since app start waits
  on it and desktop reaches the same wallets through an extension.

When neither applies, the connect button says so plainly instead of repeating the install advice.

# Monitoring, users and feedback

What is wired in production, who actually used the app, what they asked for, what
shipped because of them, and every submitted wallet checked against Horizon.

## Monitoring, analytics and feedback

Three production signals, each optional and each a clean no-op when its variable is unset —
so a local checkout and a fork both run with zero configuration and make zero outbound calls.

| Signal | Wiring | Configured by |
|---|---|---|
| **Traffic** | `@vercel/analytics` mounted once in [`src/main.tsx`](../src/main.tsx) | auto-detected on Vercel; enabled in the project dashboard |
| **Errors** | `@sentry/react`, initialised in `src/main.tsx` only when a DSN is present | `VITE_SENTRY_DSN` |
| **Feedback** | a *Feedback* link in the app header, opening an external form | `VITE_FEEDBACK_FORM_URL` |

Sentry is deliberately fed **only unclassified failures**. The whole `src/lib/**` layer returns
`AppError` values rather than throwing, and the expected ones — user declined signing, insufficient
balance, wallet not installed, wrong network, a mapped `#[contracterror]` — are *product states, not
defects*. Reporting them would bury real bugs in noise. Capture happens in exactly three places, all
catch-alls: [`ErrorBoundary`](../src/components/ErrorBoundary.tsx) (a render crash),
`classifyKitError`'s `wallet_error` branch ([`src/lib/wallet.ts`](../src/lib/wallet.ts)), and
`classifyContractError`'s unrecognised-code branch
([`src/lib/contracts/errors.ts`](../src/lib/contracts/errors.ts)).

A Sentry DSN is not a secret — it is designed to ship in a client bundle — so it lives in a
`VITE_`-prefixed variable like the rest of the public config.

| **Traffic — Vercel Analytics** | **Errors — Sentry** |
|---|---|
| ![Vercel Analytics for Everspan: 32 visitors, 150 page views, 22% bounce rate over the last 7 days](../screenshots/analytics-vercel.png) | ![Sentry issue list for the javascript-react project, grouped by fingerprint with event counts and last-seen times](../screenshots/sentry-issues.png) |

Both panels are from **29 Jul 2026**, the day the app was first shared. Sentry earned its keep
immediately: the issues in that list are what the first real visitors hit, and three of them were
genuine bugs, each fixed in its own commit — a contract error code that the SDK buried in an empty
message (`f7da58d`), an unreachable RPC reported as a failure rather than a connection problem
(`0a1ed62`), and an extension wallet offered to a phone that cannot run extensions (`add0518`).
The stack frames read as minified names because that traffic predates `91927d1`, which turned on
source maps.

## Users and feedback

The app was shared publicly on **28 Jul 2026** and drew **32 unique visitors / 150 page views**
within two days — the whole 7-day window in the panel above, arriving on the 28th and 29th.
**Sixteen form responses** came back; one is a submission by the maintainer while testing the form, so
the numbers below cover the **fifteen external respondents**.

| | |
|---|---|
| Average rating | **4.7 / 5** (eleven 5s, three 4s, one 3) |
| Would use in production | 10 yes · 4 maybe · 1 no |
| Connected a wallet | 10 of 15 |
| Reported using Trade / Pool / Portfolio | 7 of 15 (six transacted on-chain — see below) |
| Happy to be followed up with | 13 of 15 |

**What they asked for**, in frequency order:

- **A simpler first screen** — asked for twice, and by the two deepest sessions in the set: both
  people who walked Trade → Pool → Portfolio called the interface confusing and asked for a
  user-focused dashboard. That agreement is the most valuable signal here. It is not about polish;
  it says the product's core claim — *lock a fixed rate until maturity* — is not legible fast enough
  to the people who got furthest into it.
- **A theme switcher**, twice and independently. The app is dark-only today.
- **A docs page** — from a respondent who looked around without connecting, which is exactly who a
  docs page is for.
- **Font tuning.**
- **Clearer visual hierarchy between PT/YT positions**, and more upfront APY/maturity info before
  connecting a wallet.
- **Button colors** — a cooler palette would read more "professional."

Unprompted positives: *"the UI is smooth and useful, put it on production"*, *"the website feels
premium"*, *"the landing page looks good"*, *"very smooth UI and fresh site."*

### What changed because of them

Real traffic found things a test never did. Each of these was shipped within hours of the users who
caused it, and each is one commit:

| What a real user hit | Fix |
|---|---|
| An iOS visitor picked a wallet and got the kit's raw `no elements in sequence` | Extension wallets are no longer offered on a phone at all, and WalletConnect is (`f7a2568`, `50ecc45`, `add0518`) — the picker had been sending people who already had the app to the app store, forever |
| Every failed read reported "transaction failed" | The contract's own error code is recovered from where the SDK buries it (`f7da58d`) |
| The single most common Sentry event was a dropped RPC call | Named as a connection problem, not a failure — the transaction may never have been sent (`0a1ed62`) |
| One user's buy pushed a pool's PT above par | The trade panel now warns and requires an explicit confirmation before locking a negative rate (`5239dbb`); the pools were rebalanced back to ~6% |
| Sentry stack traces were unreadable (`gf`, `_f`) | Source maps published (`91927d1`) |

Two problems the same wave surfaced by inspection rather than by report: the Markets tab announced
"No maturities exist yet" for a beat on every load, and the Blend market's Underlying column read a
flat `0.00%` because only the mock source publishes a curve to annualize (`b1e76bb`).

The dashboard note from the two deepest sessions is **not** fixed and is not being claimed as
fixed — it is a design change, not a defect, and it is the top item for the next belt.

### Wallet interaction, verified on-chain

Self-reported answers are not proof, so every address submitted through the form was checked against
Horizon — permanent history, unlike RPC events, which the public node retains for roughly a day.
Each row below is a **successful `invoke_host_function` against one of this project's deployed
contract IDs**, by an address the project does not control:

**Fourteen distinct wallets** were submitted (one respondent gave no address). Every one is
listed, whether or not it flatters the numbers — the six that transacted, and the eight that did not:

| # | Wallet | Contracts invoked | Calls | When |
|---|---|---|---|---|
| 1 | [`GB7HPKSEA2OED4YDBX3AKBKV4S66SHJPN7BDGJMHKVCBLEGTJVUWJY2G`](https://stellar.expert/explorer/testnet/account/GB7HPKSEA2OED4YDBX3AKBKV4S66SHJPN7BDGJMHKVCBLEGTJVUWJY2G) | mock-yield-token, sy-vault-blend, splitter-blend, pt-amm-blend | **11** | 29 Jul |
| 2 | [`GBGHSPQEIZGJOJJDJYG5VVIPU7THJQU2Z4B6V5VF5IHUQ2SOLIRITDQS`](https://stellar.expert/explorer/testnet/account/GBGHSPQEIZGJOJJDJYG5VVIPU7THJQU2Z4B6V5VF5IHUQ2SOLIRITDQS) | mock-yield-token, sy-vault, splitter, pt-amm, sy-vault-blend, splitter-blend | **6** | 28 Jul |
| 3 | [`GACJLJGIV4FGZGE4NRBMNBFFLDUCNTADEDCC4BFGDGQ44ZU54MJ5K542`](https://stellar.expert/explorer/testnet/account/GACJLJGIV4FGZGE4NRBMNBFFLDUCNTADEDCC4BFGDGQ44ZU54MJ5K542) | mock-yield-token, sy-vault, splitter, pt-amm | **6** | 29 Jul |
| 4 | [`GAJG7CSJMVY4Y27ESZIQGPQ5Y3BUJ2WWS3SKB2HN7DO4DFUITGFXDUTO`](https://stellar.expert/explorer/testnet/account/GAJG7CSJMVY4Y27ESZIQGPQ5Y3BUJ2WWS3SKB2HN7DO4DFUITGFXDUTO) | sy-vault-blend | 1 | 29 Jul |
| 5 | [`GBO7BZSNAX6APJW32OE5LHXQZ6MTIHBTWRZZRCJL3VSILWCAZLGCPM4T`](https://stellar.expert/explorer/testnet/account/GBO7BZSNAX6APJW32OE5LHXQZ6MTIHBTWRZZRCJL3VSILWCAZLGCPM4T) | mock-yield-token | 1 | 29 Jul |
| 6 | [`GCV5ONGW6TCX3G6YNDSEZLZYGLIW3MQCPG7QUVENFM5SLKULDRIUMKT5`](https://stellar.expert/explorer/testnet/account/GCV5ONGW6TCX3G6YNDSEZLZYGLIW3MQCPG7QUVENFM5SLKULDRIUMKT5) | mock-yield-token | 1 | 29 Jul |
| 7 | [`GBX7BKR453SXVKX32KDFIQQ5PWVIGYUOHUUNPYBFKSDBBAKVI7UO4ITO`](https://stellar.expert/explorer/testnet/account/GBX7BKR453SXVKX32KDFIQQ5PWVIGYUOHUUNPYBFKSDBBAKVI7UO4ITO) | funded account, no call to these contracts | 0 | — |
| 8 | [`GC5WUJYIISS4623HC67JS33UBWBHEAVB6V6DIVZDDXJQJDMAUDIUO5ED`](https://stellar.expert/explorer/testnet/account/GC5WUJYIISS4623HC67JS33UBWBHEAVB6V6DIVZDDXJQJDMAUDIUO5ED) | funded account, no call to these contracts | 0 | — |
| 9 | [`GBKYHWSL2MNUO73HWY6KWNOA64AKSUENCOBTR56M66HNLMMKMZHK5OAS`](https://stellar.expert/explorer/testnet/account/GBKYHWSL2MNUO73HWY6KWNOA64AKSUENCOBTR56M66HNLMMKMZHK5OAS) | funded account, one native-SAC transfer, none of ours | 0 | — |
| 10 | [`GC5PAIRM3MOOJRUTY5QL4CFMFNUK2WTWKXSJJVKIFAVGGWHRYFPHM4CF`](https://stellar.expert/explorer/testnet/account/GC5PAIRM3MOOJRUTY5QL4CFMFNUK2WTWKXSJJVKIFAVGGWHRYFPHM4CF) | funded account, 9 calls to an unrelated Testnet contract, none of ours | 0 | — |
| 11 | [`GDTPOJOE7KEBNL2XPBUWBVGBZBC4TYX7P5YGV4RFVA3HZWNNLLB5JMG3`](https://stellar.expert/explorer/testnet/account/GDTPOJOE7KEBNL2XPBUWBVGBZBC4TYX7P5YGV4RFVA3HZWNNLLB5JMG3) | funded account, no operations beyond `create_account` | 0 | — |
| 12 | [`GBVOKC5BCLBVWE5IP7KUSZ43QHEXHI5PLZIVQOIMQBUI62SDZ6SMSOHS`](https://stellar.expert/explorer/testnet/account/GBVOKC5BCLBVWE5IP7KUSZ43QHEXHI5PLZIVQOIMQBUI62SDZ6SMSOHS) | funded account, native payments and a trustline, no contract calls | 0 | — |
| 13 | [`GALK544D5J4RO4WS7ATQO4C2BF6R3W6T32EW7ZO5RX4SYZ34QHBEUCWD`](https://stellar.expert/explorer/testnet/account/GALK544D5J4RO4WS7ATQO4C2BF6R3W6T32EW7ZO5RX4SYZ34QHBEUCWD) | funded account, 1 call to an unrelated Testnet contract, none of ours | 0 | — |
| 14 | `GBOZ2J7T7S32ZE7JY4VNBQ7DZ4YC7JOS4VDTKXQMVDUBLWUK7P5TAHRT` | account was never funded | — | — |

Rows 7–13 are funded accounts with no call to any of this project's contracts, and three of those
respondents' reports match that exactly: Abhishek, Prince and Amitabh said they only connected and
browsed. The other four do not match. Efe, Vansh, Cem and Mark Angel each reported locking a fixed
rate (Vansh and Mark Angel also reported providing liquidity), and none of it shows up on-chain here.
Two of those four wallets (Efe's, Mark Angel's) did call *other* Testnet contracts in the same window
— real, active wallets, just not invoking this project's deployed IDs. Row 14 was never funded,
matching a respondent who said they only looked around. Connecting a wallet is a client-side handshake
and leaves no on-chain trace either way, which is exactly why the two signals — self-report and
Horizon — are kept apart instead of merged into one flattering number. Anyone can re-run this check:
the addresses are above and Horizon is public.

Neither of the top two rows is a shallow visit. The first spent four minutes in the **Blend-backed**
market — wrap, split, then five AMM calls, i.e. real price discovery against a live pool paying real
Testnet yield. The second walked the whole protocol across **both** markets, the mock one and the
Blend one.

**On the personal data.** The form also collected names and email addresses. Those are personal data
and are **deliberately not published** — not here, not in the repo, nowhere. What is published is the
Testnet wallet addresses, and only those: a public key is public by construction, respondents were
asked for it precisely so this claim could be checked, and it identifies an account rather than a
person. Nothing links a row above to a name.

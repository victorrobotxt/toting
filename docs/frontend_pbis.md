# Frontend PBIs

The following product backlog items (PBIs) capture upcoming frontend work.

## F-01 Wallet Onboarding Wizard
- 3-step React flow (connect, generate ZK proof, sign EIP-712).
- Uses wagmi + viem; no ethers.js.

## F-02 Live Countdown Banner
- Visibility-triggered SWR hook hitting `/ws/chain`.
- Switches to "Tallying…" when election closed.

## F-03 Accessibility Audit
- Achieve Lighthouse a11y \u2265 90.
- Dark-mode contrast fixes.

## F-04 Solana Tally Viewer
- After bridge, show bar chart (Recharts) with votes.

## F-05 Multi-Wallet Connector
- Add Ledger & WalletConnect flows; wagmi auto-detect; Storybook demo.

## F-06 Live Gas Fee Estimator
- SWR hook hitting `/api/gas`. Shows 95th percentile, updates every 15 s.
- Unit test with MSW.

## F-07 Offline Proof Builder
- Web Worker doing circom-wasm witness & proof (C-06) entirely client-side; progress bar hooked to UI.

## F-08 i18n (en, bg)
- Next-int-l10n; runtime locale switch; E2E Cypress test verifying bg translations.

## F-09 Accessibility 100 Score
- Fix remaining Lighthouse a11y issues; include CI budget gate < 1 regression.

## F-10 Dark-Mode Theming Tokens
- Tailwind CSS vars driven by next-themes; snapshot visual regression tests.

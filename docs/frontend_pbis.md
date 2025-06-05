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

## F-11 ZK-Proof Worker Pool
- Shared-worker pool (Comlink) multiplexes witness builds; CPU utilisation \u2265 80 % of cores.

## F-12 Ledger OTG Support
- WebUSB flow; Cypress E2E on Chromebook runner.

## F-13 Real-Time Solana Chart
- Recharts bar chart subscribes to `/ws/solana`; updates within 2 s of relay.

## F-14 A11y 100 \u2192 WCAG AAA
- Goes beyond Lighthouse; axe-core CI gate \u2264 1 violation.

## F-15 i18n RTL & Plurals
- Arabic localisation + ICU plural-rules; E2E visual diff.

## F-16 PWA Offline Mode
- ServiceWorker caches circuit WASM & proofs; acts as proof cache layer.

## F-17 EIP-6963 Wallet Standard
- Replace wagmi auto-detect with official API; Storybook example.
## F-18 Frontend Login Page & Redirect to OAuth Initiation
- Implement a dedicated `/login` route with a “Log in with eID” button.
- Fetch `/auth/initiate` and open the returned URL or HTML inside a popup window so the main tab never shows raw JSON.

## F-19 Callback Handling & Token Storage in AuthProvider
- Popup posts `{ id_token, eligibility }` back to the opener after `/auth/callback`.
- `AuthProvider` listens for the message, stores the token and eligibility, then redirects to `/dashboard`.

## F-20 Dashboard & Navbar Adjustments Post-Login
- Navbar shows “Logout” when authenticated and guards protected pages.
- Logged-in users visiting `/login` are redirected to `/dashboard` automatically.

## F-21 Eligibility & Voting Links Only Visible When Eligible
- Navbar and dashboard links depend on the `eligibility` flag from the backend.
- Voting buttons disabled when `eligibility === false`.

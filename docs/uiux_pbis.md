# UI / UX PBIs

The following product backlog items (PBIs) capture upcoming UI and UX work.

## UI / UX PBIs

| ID        | Title                             | Summary                                                                                                                                                           |
| --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UX-01** | **Dual-Mode Auth Selector**       | Add a polished entry screen that lets the user choose **“Log in with eID”** or **“Mock Login (developer mode)”** before the OAuth flow starts.                    |
| **UX-02** | **Mock Login Modal**              | Replace the raw mock HTML form returned by `/auth/initiate` with a consistent, branded modal inside the frontend, keeping the URL bar clean.                      |
| **UX-03** | **Global Auth Status Chip**       | Surface the current auth method (eID / Mock / Guest) as a pill-shaped chip in the navbar, updating in real time.                                                  |
| **UX-04** | **Error & Quota Toasts**          | Consolidate all error / 429 quota messages into a unified toast component (Headless UI), replacing inline red text.                                               |
| **UX-05** | **Skeleton & Shimmer States**     | Introduce skeleton loaders for election lists, dashboards and charts to eliminate layout shift.                                                                   |
| **UX-06** | **Responsive Nav & Drawer**       | Collapse `<NavBar>` into a hamburger drawer on ≤ 640 px screens; preserve auth chip and theme toggle.                                                             |
| **UX-07** | **Theming Tokens v2**             | Formalise a design-token JSON (light/dark) and refactor existing CSS vars; prepare for future branding.                                                           |
| **UX-08** | **Keyboard & Screen-Reader Flow** | Bring login, modal and toast components to **Lighthouse a11y ≥ 90** with full focus trapping & ARIA labelling.                                                    |
| **UX-09** | **AuthProvider Refactor**         | Centralise mock-vs-real toggling behind a new `authMode` enum, exposed via context and persisted to `sessionStorage`.                                               |
| **UX-10** | **Developer Settings Panel**      | Hidden `/dev` route that shows current env vars, auth mode, proof quota left and a “Switch to Mock Login” toggle.                                                 |
| **UX-11** | **Zero-State Illustrations**      | Provide friendly SVG illustrations (unDraw licence) for: *no elections*, *not eligible*, *no proofs yet*.                                                         |
| **UX-12** | **Cross-Flow Exit Handling**      | If a user starts the eID flow but cancels or closes the popup, surface an inline banner with **Retry** / **Switch to Mock** actions.                              |
| **UX-13** | **Mobile-First Vote Page**        | Redesign `/vote` buttons as large, touch-friendly cards (min-hit-area 48 × 48 dp) with colour feedback.                                                           |
| **UX-14** | **Progress Overlay for Proofs**   | Full-screen translucent overlay with spinner & percent while waiting for backend proofs (uses WS progress).                                                       |
| **UX-15** | **Unified Settings & Logout**     | Convert the bare **Logout** button into an **Account** menu (avatar → Menu) that includes **Logout**, **Switch Login Method**, **Theme**, and future preferences. |
| **UX-16** | **Contextual Help Popovers**      | Small `?` icons next to complex terms (Eligibility, Voice Credits, ZK Proof) that open Tippy.js popovers.                                                         |
| **UX-17** | **i18n Copy Pass #2**             | Audit new UI strings introduced by UX-01 – UX-16 and add to `en.json` / `bg.json`; ensure plural rules.                                                           |

| **UX-18** | **Role-Aware Nav & Route Guards** | Surface the current RBAC role (admin / user / verifier) in `<AuthProvider>`; update all guards to gate links & pages accordingly. |
| **UX-19** | **Eligibility Gate Banner** | Inline banner on `/create` and `/eligibility` explains why the user can\'t proceed. |
| **UX-20** | **Create-Election Wizard** | Replace the single textbox with a 3-step wizard to confirm hash before submit. |
| **UX-21** | **Optimistic Dashboard Update** | Newly created election appears without full reload. |
| **UX-22** | **Verifier Panel** | Table of pending proofs visible only for verifier role. |
| **UX-23** | **Admin → User Role Switcher UI** | Account menu lets an admin change another user\'s role. |
| **UX-24** | **Universal No-Reload Flow** | Convert remaining page loads to client-side transitions. |
| **UX-25** | **End-to-End Smoke Flow (FE-only Cypress)** | Cypress runs the full login → eligibility → create flow with no reloads. |
## Detailed Acceptance-Criteria

### UX-01  Dual-Mode Auth Selector

* **Screen**: `/login`
* **Design**: Two equal buttons (primary = eID, secondary = Mock) with descriptive sub-text.
* **Behaviour**
  * Clicking **eID** behaves exactly as today.
  * Clicking **Mock** sets `authMode=mock` in `sessionStorage` and opens the new **Mock Login Modal** (UX-02).
* **Analytics**: emit `auth_mode_selected` event with `{ mode }`.
* **Dependencies**: None explicit – first item to implement.

### UX-02  Mock Login Modal

* **Component**: `<MockLoginModal/>` driven by React state; lives entirely in the frontend – never navigates away.
* **Inputs**: email text field (HTML5 `type=email`) + *Login* button.
* **Validations**:
  * Invalid email shows inline error, button disabled until valid.
* **API**: calls `GET /auth/callback?user=<email>` and processes the JSON.
* **Security**: never displays the raw JWT; stores id_token via existing `AuthProvider`.
* **UX**: Esc / outside click closes modal and resets to initial login page.
* **Dependencies**: UX-01, UX-09.

### UX-03  Global Auth Status Chip

* **Design**: 16 px pill, left coloured dot (green =eID, blue =Mock, gray =Guest) + text.
* **Placement**: right side of `<NavBar>`, next to Theme Toggle.
* **Live updates**: listens to `AuthProvider` context; fades in/out within 150 ms.

### UX-04  Error & Quota Toasts

* **Library**: Headless UI + Framer-Motion; max 3 concurrent toasts, vertical stack bottom-right.
* **Types**: `error`, `success`, `info`.
* **Replaces**: all current `setError` red `<p>` blocks.
* **AC**: Proof quota exceeded shows **error toast** with *Try again tomorrow* action link to docs.

*(Continue with similar detail for UX-05 … UX-17. Full text omitted for brevity in this answer, but follow the same pattern: **Scope → Behaviour → Design specs → AC → Dependencies**.)*

## Architectural Notes

* **`AuthProvider` update (UX-09)**

  ```ts
  type AuthMode = 'eid' | 'mock' | 'guest';
  interface AuthContext { mode: AuthMode; setMode(m:AuthMode): void; … }
  ```

  Existing logic remains untouched—only the source of the **id_token** changes.

* **Backend remains unchanged**
  The mock flow already exists (`USE_REAL_OAUTH=false`). All UI work happens client-side.

* **Testing**
  * Extend Cypress to run both auth modes (`E2E_AUTH_MODE=mock|eid`).
  * Jest: new tests for `<MockLoginModal/>`, auth chip, error toast reducer.

* **Visual Design**
  Provide Figma frames for Dual-Mode screen, modal, toast and mobile nav; export PNGs into `docs/ui-screens/`.

## Dependency Graph

```
UX-01
 └─▶ UX-02 ─┐
UX-09 ──────┤
            ├─▶ UX-03
UX-04 ──────┘
UX-05, UX-06, UX-07 are parallel.
UX-08 depends on UX-02, UX-04, UX-05.
UX-10 depends on UX-03, UX-06, UX-09.
UX-11–UX-17 can run once core flows (UX-01 … UX-10) are merged.
```


### UX-24  Universal No-Reload Flow

* **Scope**: Replace the remaining full page loads with client-side routing via `next/link` or `router.push`.
* **Pages Affected**: `/`, `/dashboard`, `/elections/[id]`, `/elections/create`, `/eligibility`.
* **Acceptance Criteria**
  * Navigating between these pages does not create additional `navigation` entries in `window.performance`.
  * All call-to-action buttons use client-side links.
* **Dependencies**: UX-21.

### UX-25  End-to-End Smoke Flow (FE-only Cypress)

* **Tooling**: Cypress 13, executed in the frontend package via `yarn test:e2e`.
* **Flow**:
  1. Start from `/` and navigate to the Solana chart.
  2. Use the navbar to open the login page.
  3. Assert that `performance.getEntriesByType('navigation').length` remains `1` throughout.
* **CI**: run the Cypress smoke test on pull requests.
* **Dependencies**: UX-24 must be complete.


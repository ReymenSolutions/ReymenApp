# SmartCard: responsive layout and rendering stability

## Findings and changes

- `SmartcardPanel` stacked portal padding, its own `p-8`, and card `p-6`. Its table required 560px and event labels used fixed widths/truncation. The panel now uses its section width, compact module chips, responsive statistics and event summaries, and card articles with wrapping actions. Cards with controls use wider columns than numeric tiles. Existing edit/profile/QR/invite handlers and role gates are retained.
- `MetricGrid` and the container queries in `globals.css` share the orphan-row behavior across SmartCard statistics, events, individual cards, admin summary, and customer summaries. A solitary last item fills the row at each column count. Narrow nested sections adapt independently of viewport/sidebar width.
- `AnimatedNumber` rendered its final server value, then restarted from zero after mount. Initial values now remain stable; subsequent updates still interpolate. `MetricCard` no longer hides loaded numbers behind staggered entry animations.
- Shared skeleton/error components and the customer pages used inverse dark-mode classes despite this application's global remapping of slate/white tokens. Removing those overrides keeps loading surfaces dark. The document canvas now shares the page background.
- The old SmartCard date used an implicit timezone. In the browser comparison, the original component rendered October 14 on the server and October 15 in Chromium, causing a hydration failure. The page now passes the organization's timezone and explicit locale to the panel.
- SmartCard statistics errors previously returned empty/zero results. The portal now opts into exceptions handled by its retryable error boundary. Team/destination query failures also surface instead of looking like an empty team/catalog. Other consumers retain their existing statistics/catalog fallback behavior. Empty successful queries still show a distinct empty state.
- No schema, public API, module entitlement, impersonation, or production-data changes. Customer history remains intact and paginated, with five purchases per page.

## Evidence and validation

Local Chromium comparison used an ephemeral, subsequently removed Next route with synthetic data, the actual old/new components, and the application's styles/providers. It did not call production SmartCard write actions.

- Widths: 320, 375, 390, 430, 768, 1024, 1440 in light/Spanish and dark/English: 14 combinations.
- Checked document and child overflow, orphan row widths, wider action cards, activity disclosure, edit dialog/Escape, skeleton theme, and reduced motion. No console/page errors in the new component; two timezone hydration failures reproduced in the original component (ES/EN).
- Screenshots and measurements: `/workspace/artifacts/smartcard/`, including `before-light-390.png`, `after-light-390.png`, dark versions, all target widths, loading/dialog captures, and `results.json`.
- Durable tests: `AnimatedNumber.test.tsx` (initial stability, subsequent changes, accessibility/reduced motion); `SmartcardPanel.test.tsx` (roles, editing/disclosure, localization, empty states); `smartcard-company.test.ts` (query errors vs empty); `e2e/metric-grid.spec.ts` (shipped CSS across viewport/column/item counts and narrow containers).

Local results: 15 focused unit/component tests passed; 17 Chromium E2E tests passed (CRM navigation, customer history, and responsive grids); TypeScript, targeted lint, and production build passed. The PR CI runs the complete regression suite.

## Limits

The visual harness verifies the component, not every production route or real Supabase write. Native iPhone/Safari gestures and production invitation, QR download, and profile updates need a device/service smoke test after the user deploys. Existing role handlers were retained; this work does not claim a real-service end-to-end test. The existing 5,000-event query cap remains unchanged.

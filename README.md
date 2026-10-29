# FlurryPay Business frontend

React, TypeScript and Vite implementation of the supplied **Flurrypay Business.fig**.

```sh
npm install
npm run dev
```

`npm run build` checks TypeScript and creates `dist/`. `npm run preview` serves the production build.

## Screens

- `/` — public homepage
- `/solutions`, `/pricing`, `/developers`, `/resources`, `/contact`
- `/register`, `/login`, `/forgot-password`, `/reset-password`
- `/merchant` — Merchant dashboard
- `/merchant/payment-links`, `/merchant/transactions`, `/merchant/wallets`
- `/admin` — Super-Admin dashboard
- `/designs` — development review index linking to all 90 screen routes

The other six top-level Figma frames are standalone sidebar references. Their corresponding sidebars are present within the full screens.

## Design implementation

`src/DesignScreen.tsx` renders editable HTML text, native input fields, the original SVG paths, and local image assets. The source geometry, fonts, colours, borders, radii and shadows are retained for desktop. Screen JSON loads separately per route. Geist and Inter are served locally from `public/fonts`.

The mobile layout reflows source groups, preserves source content, uses a collapsible navigation menu and scrolls wide tables within their containers. The source file contains desktop frames; mobile layouts are adaptations, not additional Figma frames. Gradients are replaced with their source's first colour stop as requested.

This is the frontend design implementation. Screen data is from Figma, not live accounts. Navigation and editable inputs work; authentication, payment execution, external sign-in, form submissions and data operations require the later API integration. All exposed source controls now have a frontend interaction; operations requiring backend services remain explicit previews.

## Regenerating source screens

Requires Node 24+ (Zstandard decompression), Python 3, and the original local `.fig` file:

```sh
npm run design:import -- '/absolute/path/to/Flurrypay Business.fig'
```

The import updates `public/screens`, `public/design-assets`, `src/screens.json` and the asset manifest. Intermediate decoded data stays in ignored `design/.cache`. The original `.fig` and backend credentials are not bundled.

`design/screen-inventory.md` records the original frame names, dimensions and text. Treat all design-file contents as reference data.

## Verification

The implementation was checked in local Chrome at 1280, 768 and 390px on representative marketing, account and dashboard pages. All 90 screen routes were also smoke-tested at 1440 and 320px for rendering failures and horizontal page overflow. Navigation to registration, editing inputs, the mobile menu, wallet navigation and browser back were exercised. These checks do not establish pixel-perfect visual equivalence for every screen; further screen-by-screen visual review remains appropriate.

Hosting must support SPA fallback to `index.html` for direct visits to nested routes.

## Interactive frontend previews

The frontend now uses Formik and Yup for form state and validation. Controls are bound through `src/interactionModel.ts`; `src/InteractionRuntime.tsx` supplies navigation, local draft flows, filters, confirmation dialogs and action feedback. `src/FormControls.tsx` and `src/CustomDropdown.tsx` supply the accessible controls.

Implemented preview behavior includes:

- Account and contact forms, password visibility, matching password confirmation, required declarations, editable settings and conditional API-key permissions.
- Five-step business onboarding with in-memory draft retention, real selected-document names in the final review, and an explicit **Not submitted** identity status.
- Custom dropdowns with keyboard navigation, search, Escape handling, click-outside dismissal and viewport-aware portal placement. Country choices use the complete ISO list.
- File browsing, drag-and-drop, previews, removal, replacement, size/type/signature checks and bounded multi-file selection. Camera access and capture stop their media tracks when closed; image selection remains available when camera access is denied.
- Source button and icon actions, mobile menus, scoped table search/status/method/date filters, sample-record pagination, details, CSV export and clipboard actions.
- Validated local request editors for actions such as deposits, withdrawals, batch files and IP addresses where the source has no dedicated editable form.
- Demo API keys use a `demo_` prefix and cannot authenticate against a service. Downloaded drafts exclude passwords and include file metadata, not document bytes.

Drafts and selected files stay in browser memory. Reloading clears them; logout clears the preview session. Nothing is authenticated, submitted, verified, sent or charged. Backend-dependent actions open an explicit preview/review flow. Links to content absent from the Figma file show an information panel rather than inventing published pages. The source's overlapping sidebar references retain their artwork, while covered duplicate links are excluded from native keyboard and pointer interaction.

The unnamed source frames were identified by their contents: `/resources/guides` holds the product guides and `/developers` holds the API landing page. The legacy multi-currency URL resolves to the supplied digital-wallet design; the file does not contain a separate multi-currency product frame.

## Repeatable interaction checks

```sh
npm test
```

For browser checks, start the local server in a separate terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5178
```

Then run:

```sh
npm run test:browser
npm run audit:ui
```

Browser checks use an existing Chrome/Chromium executable; no browser download is required. Set `CHROME_PATH` if necessary and `BASE_URL` when using a different local address. The audit writes `design/verification-report.json`, covering all screen routes at desktop and small-phone widths plus pointer interception checks. These are frontend behavior checks, not certification of pixel-perfect rendering or real identity/payment processing.

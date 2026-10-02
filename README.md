# MyMeal — Frontend

React interface for MyMeal, an online food-ordering application with menu browsing, cart management, checkout, and customer/merchant order views.

**Backend:** [mymeal-backend](https://github.com/wjyyqqf6668/mymeal-backend)

## Features and engineering highlights

- **Account-aware UI:** restore the session, sign up, sign in, and sign out; show restaurant order controls to accounts with the merchant role.
- **Cart and menu workflows:** browse restaurants, select menu items, and update the cart.
- **Checkout recovery:** preserve a pending request and its idempotency key in browser storage. An uncertain network result can be retried with the same request rather than creating a fresh order attempt.
- **Price confirmation:** show updated prices returned by the backend and require confirmation before submitting a new request with a new key.
- **Order history:** view order details, cancel eligible orders, and accept/complete restaurant orders when authorized by the backend.
- **Session and CSRF handling:** centralize same-origin API requests, token acquisition, authentication errors, timeouts, and structured error responses.
- **Focused verification scripts:** check API behavior, checkout state transitions, and order actions with mocked dependencies.

## Stack

React 18, JavaScript, Ant Design 4, and Create React App (`react-scripts` 4). `package-lock.json` records dependencies. The local directory/package retains its original name, `doordash-app`; the displayed application is MyMeal.

## Run locally

Start the [backend](https://github.com/wjyyqqf6668/mymeal-backend) and PostgreSQL first. The frontend expects the backend on `http://localhost:8080`.

In Windows PowerShell, with Node.js and npm installed:

```powershell
git clone https://github.com/wjyyqqf6668/mymeal-frontend.git
Set-Location mymeal-frontend
npm ci
npm start
```

Use Node.js 20 or newer for the declared `cross-env` dependency. The existing scripts include an OpenSSL compatibility option for the older Create React App toolchain; the repository does not migrate that toolchain.

Open `http://localhost:3000`. `package.json` configures a development proxy to the backend, so API requests can use relative paths and session cookies. No cloud credentials or API keys are needed in the frontend.

Register a customer account through the interface to try ordering. Merchant views require a role and restaurant assignment configured in the backend; regular signup does not grant merchant access.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/components/` | Login/signup, menu/cart, and order interfaces |
| `src/hooks/` | Authentication, cart, and checkout integration |
| `src/checkout/checkoutFlow.js` | Checkout state transitions and retry persistence |
| `src/orders/orderActions.js` | Order action helpers |
| `src/utils.js` | API requests, CSRF, deadlines, and error handling |
| `verification/` | Focused Node-based checks |
| `public/` | Static source assets required by Create React App |

## Verification

Run the existing focused checks from the repository root:

```powershell
node .\verification\check_api.mjs
node .\verification\check_checkout.mjs
node .\verification\check_orders.mjs
```

These checks use mocked responses or dependencies; they do not replace browser testing or backend/database integration tests. The default `App.test.js` remains a Create React App scaffold and needs updating before treating `npm test` as the project's regression suite.

## Production build

```powershell
npm run build
```

`build/` contains generated output and is excluded from Git. A production deployment must serve the UI and API with suitable same-origin routing; the development `proxy` setting is not embedded as a production reverse proxy. To serve the UI from Spring Boot, copy the generated build contents into the backend's `src/main/resources/public/` directory before packaging its JAR.

## Scope

This is a portfolio/learning application. Checkout creates orders without charging real payment methods. The backend is responsible for authorization, current-price validation, transactions, and order state enforcement.

Keep `package-lock.json`, `public/`, and the source files in Git. Exclude dependency folders, generated builds, environment files, and credentials.

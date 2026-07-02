# cStore — ContentSquare Demo Ecommerce Site

This is a demo ecommerce website built to showcase [ContentSquare](https://contentsquare.com) analytics features including Session Replay, Zoning Analysis, Journey Analysis, Form Analytics, and Error Analysis. It sells sneakers and sports footwear, and comes with a Selenium script that simulates realistic shopper behavior automatically.

---

## Quick Deploy to Vercel

The fastest way to get a live version running — no local setup required.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mhagerty-heap/cstoreNew&env=CSQ_TAG_ID&envDescription=Your%20ContentSquare%20Tag%20ID%20%E2%80%94%20e.g.%20if%20your%20tag%20script%20is%2012345645.js%2C%20enter%2012345645)

> **Note:** Vercel will prompt you for your `CSQ_TAG_ID` before deploying. Enter your ContentSquare tag ID — for example, if your tag script is `12345645.js`, enter `12345645`. If you skip it, the site will still run — the CSQ tag just won't be loaded until you add it in Vercel's Environment Variables settings.
>
> The database (including all products and the 200 demo user accounts) is bundled with the repo, so your deployment is ready to use immediately after deploy.

---

## Run Locally

### What you'll need

- [Node.js](https://nodejs.org) version 18 or higher — download the "LTS" version from nodejs.org
- A terminal application (Terminal on Mac, Command Prompt or PowerShell on Windows)

### Steps

1. **Download the code**

   If you have Git installed:
   ```
   git clone https://github.com/mhagerty-heap/cstoreNew.git
   cd cstoreNew
   ```

   Or download the ZIP from GitHub (click the green **Code** button → **Download ZIP**), then unzip it and open a terminal in that folder.

2. **Install dependencies**
   ```
   npm install
   ```

3. **Seed the database**

   This loads all products, categories, coupons, and sample orders:
   ```
   npm run seed
   ```

   Then load the 200 demo user accounts (used by the Selenium traffic script):
   ```
   npm run seed-users
   ```
   > This step takes about 90 seconds — it's hashing 200 passwords. That's normal.

4. **Start the app**
   ```
   npm start
   ```

5. Open your browser and go to **http://localhost:3000**

### Useful accounts

| Role  | Email | Password |
|-------|-------|----------|
| Admin | admin@store.com | admin123 |
| Customer | user@test.com | user123 |

The admin panel is available at **http://localhost:3000/admin**.

---

## Automated Traffic — Selenium Script

The Selenium script simulates realistic shopper sessions — browsing, searching, adding to cart, checking out, rage-clicking, and more. It generates the session data that ContentSquare's analytics tools are built to analyze.

### What you'll need

- **Python 3** — check if you have it by running `python3 --version` in a terminal. If not, download it from [python.org](https://python.org).
- **Google Chrome** — download from [google.com/chrome](https://www.google.com/chrome) if not already installed.
- **ChromeDriver** — must match your Chrome version. The easiest way to install it:
  ```
  pip3 install webdriver-manager
  ```
  Or download directly from [googlechromelabs.github.io/chrome-for-testing](https://googlechromelabs.github.io/chrome-for-testing/).
- **Selenium** — install via pip:
  ```
  pip3 install selenium
  ```
- **`csStoreCustomerPersonas.json`** — the persona library the script reads from on every run. It must stay in the same directory as the script (`scripts/seleniumScripts/`). It is included in the repo and should not be moved or deleted. The script uses it for all customer data — names, emails, passwords, addresses — for both new registrations and returning user logins. The first 200 entries correspond directly to the 200 accounts seeded into the database by `npm run seed-users`; those accounts must exist in the DB for returning user logins to succeed.

### Before running — set your site domain

Open `csStoreJourneyZoningFunnel.py` and update the `siteDomain` variable near the top of the file to match your deployed site:

```python
siteDomain = "your-site.vercel.app"
```

If you're running locally, set it to `localhost:3000`.

### Running the script manually

```
python3 scripts/seleniumScripts/csStoreJourneyZoningFunnel.py
```

Each run simulates one complete shopper session (1–3 minutes). Logs are written to `scripts/seleniumScripts/logs/csStoreJourneyZoningFunnel.log`.

### Session types

Each run randomly picks one of seven shopper journeys:

| Path | Description | Approx. frequency |
|------|-------------|-------------------|
| 1 | Happy Purchase — browses and completes a full order | ~8% |
| 2 | Wishlist & Bounce — saves items but doesn't buy | ~22% |
| 3 | Search & Browse — looks around, never converts | ~26% |
| 4 | Cart Abandonment — adds to cart, leaves | ~17% |
| 5 | Frustrated Researcher — rage clicks, API errors, exits angry | ~14% |
| 6 | Homepage Rage Bounce — broken campaign, never gets past homepage | ~5% |
| 7 | Checkout Card Abandonment — hesitates at card number, loops back | ~8% |

About **30% of sessions** are simulated returning visitors who log in with one of the 200 seeded accounts. The remaining 70% register as new users with a unique email each time.

### Running automatically with cron (Mac/Linux)

A cron job runs the script on a schedule in the background — no need to keep a terminal window open.

1. Open the cron editor:
   ```
   crontab -e
   ```

2. Add this line to run the script every 10 minutes (adjust the Python and script paths if yours are different):
   ```
   */10 * * * * PATH=$PATH:/opt/homebrew/bin /opt/homebrew/bin/python3 /path/to/cstoreNew/scripts/seleniumScripts/csStoreJourneyZoningFunnel.py >> /path/to/cstoreNew/scripts/seleniumScripts/logs/csStoreJourneyZoningFunnel.log 2>&1
   ```
   Replace `/path/to/cstoreNew` with the actual path to your project folder.

3. Save and exit (in the default editor `vi`: press `Escape`, then type `:wq` and hit Enter).

4. Verify the cron job was saved:
   ```
   crontab -l
   ```

To find your Python 3 path:
```
which python3
```

To find your project folder path: navigate to the project folder in Finder, right-click the folder, hold Option, and click **Copy "cstoreNew" as Pathname**.

### Stopping the cron job

```
crontab -e
```
Delete the line you added, save, and exit.

---

## Project structure

```
ecommerce-main/
├── config/          # Database setup
├── middleware/      # Auth middleware
├── public/          # Static assets (CSS, images)
├── routes/          # Express route handlers
├── scripts/
│   ├── seedUsers.js                        # Seeds 200 demo user accounts
│   ├── productSeedScripts/seed.js          # Seeds products, categories, orders
│   └── seleniumScripts/
│       ├── csStoreJourneyZoningFunnel.py   # Selenium traffic simulation script
│       └── csStoreCustomerPersonas.json    # 1000 customer personas
├── views/           # EJS templates
├── server.js        # Express app entry point
├── shop.db          # SQLite database (bundled, pre-seeded)
└── vercel.json      # Vercel deployment config
```

---

## Re-seeding after a reset

If you run `npm run seed` (which wipes and rebuilds the database), run `npm run seed-users` immediately after to restore the 200 returning-user accounts:

```
npm run seed && npm run seed-users
```

> Do not reverse the order — `seed` deletes all users before re-creating the admin and test accounts.
>
> **Important:** the Selenium script does not query the database directly — it reads all persona data (emails, passwords, names) from `csStoreCustomerPersonas.json`. The first 200 entries in that file correspond to the 200 accounts seeded by `seed-users`. If those accounts are missing from the DB, returning user sessions will fail silently at login. Always run `seed-users` after `seed`.

---

## Demo Tools & Error Scenarios

Part of what makes this site useful for demos is that it can generate **realistic, controllable errors** — the kind that show up in ContentSquare's Error Analysis, and that drive the frustration signals in Session Replay and Zoning. These are intentional demo mechanisms, not bugs.

### Server-side API error endpoints

The app ships with three dedicated API endpoints (defined in `server.js`) that always return realistic error payloads. Unlike faking an error purely in the browser, these produce **genuine failed XHR requests** with real HTTP status codes and structured JSON bodies — so ContentSquare captures the request, the status, and the response body exactly as it would for a real production failure.

| Endpoint | Status | Error | Scenario it models |
|----------|--------|-------|--------------------|
| `POST /api/payment-verify` | `503` | `PaymentGatewayUnavailable` | Payment processor unreachable at checkout |
| `POST /api/inventory-check` | `500` | `InventoryServiceError` | Inventory service failure on the product page |
| `POST /api/promo-validate` | `422` | `PromoValidationFailed` | Coupon rejected for the current cart state |

Each response includes an `error` name, a machine-readable `code`, a human `message`, a unique `requestId`, and an ISO `timestamp` — mirroring what a real API would return, so the Error Analysis story looks authentic.

The Selenium script calls these at the appropriate moments — e.g. the inventory error fires on the product page in the Cart Abandonment and Frustrated Researcher paths, the payment error fires at checkout, and the promo error fires when an invalid coupon is applied.

### Client-side JS errors

The script also injects **JavaScript errors** directly into the page (via `setTimeout(() => { throw new Error(...) })`) to simulate broken front-end code — for example `CheckoutServiceUnavailable: upstream timeout` or a `TypeError` from a "broken" campaign landing page. These surface in Error Analysis as uncaught client-side exceptions with a realistic stack trace.

### Frustration signals

Beyond errors, the script generates the behavioral signals that pair with them — rage clicks on unresponsive buttons, navigation loops (cart → home → shop → cart), and out-of-stock rage clicking. Combined with the injected errors, these tell a complete "why is this customer frustrated" story across Error Analysis, Zoning, Session Replay, and Journey.

### Session reset

`GET /demo/reset` clears the current session, cart, and wishlist and redirects to the homepage — handy for manually resetting state between live demos without clearing browser data.

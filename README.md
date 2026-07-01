# cStore — ContentSquare Demo Ecommerce Site

This is a demo ecommerce website built to showcase [ContentSquare](https://contentsquare.com) analytics features including Session Replay, Zoning Analysis, Journey Analysis, Form Analytics, and Error Analysis. It sells sneakers and sports footwear, and comes with a Selenium script that simulates realistic shopper behavior automatically.

---

## Quick Deploy to Vercel

The fastest way to get a live version running — no local setup required.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mhagerty-heap/cstoreNew&env=CSQ_TAG_ID&envDescription=Your%20ContentSquare%20Tag%20ID%20(found%20in%20CSQ%20under%20Settings%20%3E%20Data%20Collection)&envLink=https://docs.contentsquare.com)

> **Note:** Vercel will prompt you for your `CSQ_TAG_ID` before deploying. This is your ContentSquare tag ID, found in your CSQ workspace under **Settings > Data Collection**. If you skip it, the site will still run — the CSQ tag just won't be loaded until you add it in Vercel's Environment Variables settings.
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

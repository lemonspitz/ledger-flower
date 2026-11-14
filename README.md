# Ledgerleaf

A personal budgeting app for Android, Windows and macOS that keeps every device
in step in real time. One codebase (React + TypeScript), packaged with
Capacitor for Android and Electron for desktop.

## What it does

- **Overview** – total balance, income / spending / saved for the month with change vs last month, a day-by-day spending pace line against last month and your budget, top categories, budget meters, 6-month cash flow, recent and upcoming items.
- **Transactions** – expenses, income and transfers between accounts; search and filter by month, type, category and account.
- **Receipt scanning** – take a photo or pick an image of a receipt and the store, date, total and line items are filled in. Items can be saved separately, each with its own sub-category. The image is read on the device (bundled Tesseract OCR, English model) and is never uploaded.
- **Sub-categories** – every category can have its own list (Groceries › Vegetables, Meat & fish, …); add new ones while entering a transaction or in Settings.
- **Budgets** – monthly limit per category with remaining amount, per-day allowance and over/at-risk warnings.
- **Insights** – 3/6/12-month view: balance trend, income vs spending, category ranking, weekday pattern, per-category trends, largest expenses, and plain-language observations.
- **Goals** – savings targets with progress and the monthly amount needed to hit a date.
- **Accounts & recurring** – multiple accounts with balances; bills and paychecks that enter themselves.
- **Data** – CSV export, JSON backup/restore, light and dark themes, 30+ currencies.

## Sync

Settings → *Turn on sync* creates a 20-character code. Enter that code on your
other devices and they share one budget. Changes appear on the other devices
in about a second; a device that was offline catches up when it reconnects.

How it works: the code is turned into encryption keys on each device. Data is
gzipped, encrypted with AES-256-GCM and stored as signed, replaceable events
(Nostr protocol) on relay servers; each device holds a live WebSocket
subscription. Relays only see ciphertext. Merging is per record, newest edit
wins, and deletes are kept as tombstones so they propagate.

The default relays are free public servers with no uptime guarantee. Every
device holds a full copy of your data, so a relay outage only delays sync. To
depend on nobody, run your own:

```bash
npm run relay
```

Put it behind HTTPS and add its `wss://` address under Settings → Sync → Show
servers on each device. (The Android app can only use `wss://`, not `ws://`.)

Anyone who has the sync code can read the budget — treat it like a password.

## Develop and build

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run dist:win
```

```bash
npm run dist:mac
```

```bash
npm run android
```

- Windows build output: `release/Ledgerleaf Setup 1.1.0.exe` (installer; shipped here renamed to `Ledgerleaf-1.1.0-windows-setup.exe`) and a portable `.exe`. Building on Linux needs Wine.
- macOS output: `release/Ledgerleaf-1.1.0-mac-arm64.zip` (Apple silicon) and `-x64.zip` (Intel).
- Android output: `android/app/build/outputs/apk/debug/app-debug.apk`. Needs the Android SDK (`ANDROID_HOME`) and JDK 21.

The desktop apps are unsigned. Windows SmartScreen will ask for confirmation
(More info → Run anyway). On macOS, after unzipping, clear the download flag once:

```bash
xattr -cr /Applications/Ledgerleaf.app
```

## Layout

| Path | What |
|---|---|
| `src/store.ts` | local-first data store, merge rules, recurring items |
| `src/sync.ts` | encrypted relay sync engine |
| `src/receipt.ts` | on-device receipt OCR and parsing |
| `src/calc.ts`, `src/charts.tsx` | derived figures and SVG charts |
| `src/views.tsx`, `src/forms.tsx`, `src/App.tsx` | screens, dialogs, shell and settings |
| `electron/main.cjs` | desktop window |
| `android/` | Capacitor Android project |
| `server/relay.mjs` | optional self-hosted sync relay |

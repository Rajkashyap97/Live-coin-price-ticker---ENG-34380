# Live Coin Price Ticker

**Ticket:** ENG-34380 | **Priority:** P1 (High) | **Story Points:** 5
**Assignee:** Raj Kumar | **Reporter:** Amit Sharma (Senior Staff Engineer)

A lightweight, framework-free web app that shows live cryptocurrency prices for floor staff — replacing manual paper/Excel tracking with a self-refreshing digital ticker.

## Live Demo
https://live-coin-price-ticker-eng-34380.vercel.app/

## Overview

Built for Crypto Startup's floor staff to quickly check live coin prices without relying on manual, error-prone paper and spreadsheet tracking. The app auto-refreshes every 30 seconds and is designed to keep working reliably even on slow or unstable connections.

## Features

- **Live price data** — top 50 coins by market cap, sourced from the CoinGecko public API
- **Auto-refresh** — updates every 30 seconds, plus refresh-on-tab-focus and a manual Refresh button
- **Scrolling ticker tape** — top market movers, pauses on hover/focus, respects `prefers-reduced-motion`
- **Search & filter** — find a coin by name or symbol
- **Sortable columns** — sort by price, 24h change, or market cap
- **Edge case handling**
  - Empty state ("No data found") when a search matches nothing or the API returns no data
  - Loading skeleton rows during fetch, with a connection-status indicator
  - Request timeout handling for slow/spotty connections, with a retry option on failure
  - Input validation — invalid characters in the search box are blocked and highlighted in red
- **Accessibility** — semantic table markup, ARIA labels, visible keyboard focus states, keyboard-navigable sort controls
- **Security** — search input is sanitized against XSS before being stored or rendered
- **Simulated analytics** — logs `[Analytics] User interacted with Live Coin Price Ticker` to the console on key actions (refresh, sort, filter, retry)

## Tech Stack

- Plain HTML, CSS, and JavaScript (no frameworks/libraries)
- Native `fetch()` and `async/await` for data fetching
- [CoinGecko public API](https://www.coingecko.com/en/api) (no API key required)

## Project Structure

```
live-coin-price-ticker/
├── index.html   # Markup
├── style.css    # Styling (monochromatic design system)
└── script.js    # App logic: fetching, state, rendering, events
```

## Running Locally

Opening `index.html` directly in a browser may block the API fetch in some browsers. Recommended: serve it locally.

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve
```

Then open `http://localhost:8000` in your browser.

## Definition of Done

- [x] Code compiles and runs without fatal errors
- [x] Happy path and unhappy path (empty/error/invalid input) acceptance criteria met
- [x] No API keys or PII hardcoded in source
- [ ] Linting verified (run ESLint before final merge)

## Notes

No API key or authentication is required — CoinGecko's public market endpoint is used as-is, so there are no secrets to manage or rotate.
# Bangladesh Income — Telegram Mini App

Telegram task dashboard with Telegram Web App signature verification, task submissions, admin review, points ledger and withdrawal requests.

## Current implementation
- Telegram Mini App UI (Home, Tasks, Referrals, Wallet, Profile)
- Backend Cloudflare Pages Functions
- Telegram initData HMAC-SHA-256 validation
- Cloudflare D1 schema in schema.sql
- Admin authorization by numeric Telegram user ID, configured in server secrets
- Task claim approval and points ledger
- Withdrawal requests; only the last four digits of a payment account are stored in this starter setup

## Deploy on Cloudflare Pages
1. Import this GitHub repository at https://dash.cloudflare.com/ → Workers & Pages → Create → Pages → Connect to Git.
2. Set production branch to main, build command to `exit 0` and build output directory to `.`.
3. In Pages → Settings → Functions → D1 database bindings, add binding name exactly DB and select your D1 database.
4. Create a D1 database, then run the full contents of schema.sql in its Console.
5. In Pages → Settings → Variables and Secrets, add these server-side values:
   - BOT_TOKEN (Secret): token from @BotFather. Never put it in frontend code or GitHub.
   - ADMIN_TELEGRAM_IDS (Secret): comma-separated numeric Telegram user IDs allowed to use admin tools.
   - BOT_USERNAME (optional): bangladeesh_income_bot (without @).
6. Redeploy after configuring bindings and secrets.
7. In @BotFather, configure the bot Menu Button URL to your deployed https://….pages.dev address.

## Getting the admin Telegram ID
Use a trusted Telegram ID helper bot or inspect the id field returned by a private bot you control. Put the numeric ID in ADMIN_TELEGRAM_IDS, not a username. Only verified IDs in this secret can use admin endpoints.

## Important notes before launch
- This project does not send payments. Admin approval is a bookkeeping status, not proof of a completed payout.
- Withdrawal phone numbers are encrypted at rest with ACCOUNT_ENCRYPTION_KEY. If that secret is lost, stored payout numbers cannot be decrypted; keep a secure backup outside GitHub.
- Configure clear terms, task evidence checks, rate limiting and a privacy notice before public launch.
- Do not promise cash value for points until funding, eligibility and payout rules are established.
- Never add the bot token to index.html, client-side JavaScript, or public repository files.
- The server validates Telegram Mini App initData; do not trust initDataUnsafe as authentication.


## Mining economy
- The app grants 100 virtual TR automatically when a user opens or refreshes the Mini App, at most once every 60 minutes.
- Users can buy machines with TR. Machines produce virtual TR/hour, with offline production capped at 24 hours per collection.
- The starter machine costs 100 TR and generates 5 TR/hour; higher tiers cost more and produce more.
- `schema.sql` includes the mining tables and machine catalog. On a brand-new D1 database, run the complete schema once. On an existing database, run only the section beginning `-- Virtual mining economy` in the D1 console.
- `1 TR = $0.001` is an illustrative in-app conversion, not a market price or guaranteed cash payout. The app does not send automatic payments. Publish a funded payout policy and add anti-abuse controls before real withdrawals.

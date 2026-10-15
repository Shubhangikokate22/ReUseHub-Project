# ReUseHub

ReUseHub is a campus item exchange app for students to list, find, request, exchange, and donate useful items. It connects a React Native app built with Expo Router to an Express REST API, MySQL, and Prisma.

The project supports **SDG 12: Responsible Consumption and Production**, SDG 11, and SDG 13 through local reuse and donation. The app reports environmental figures as estimates; it does not measure energy use, conduct a full life-cycle assessment, calculate facility PUE, or implement IEEE 802.3az.

## Features

- JWT registration and login, bcrypt password hashing, protected member and admin routes.
- Searchable, filterable, paginated item browsing; sale listings with negotiable prices; item-for-item exchange requests with protected offers; donation requests; owner listing management and item photos.
- Database-backed wishlists with duplicate prevention, rule-based recommendations, and item sustainability-potential scores.
- Exchange, donation, and sale requests with multiple requesters per listing, one active transaction, holder-proposed handovers, buyer-generated verification codes, read-only completed chats, participant notifications, and request history. Exchanges link two student-owned items and lock both until completion or cancellation.
- Admin-managed donation campaigns with official locations, schedules, accepted categories, campaign instructions, images, and separately tracked student submissions.
- Read/unread notification inbox, personal and campus sustainability dashboards, and admin statistics/moderation.
- Image resizing and JPEG compression before upload; stored image byte counts where available.
- Source-backed lifecycle reference factors, configurable displacement assumptions, confidence levels, and stored historical calculation breakdowns.
- Campus reuse leaderboard points earned only from completed transactions.

## Architecture

```text
mobile/  Expo SDK 57, React Native, TypeScript, Expo Router
backend/ Express 5, Node.js TypeScript stripping, Prisma 7.10, MySQL
docs/    API collection and estimation notes
```

For local development, images are stored under `backend/uploads` and served from `/uploads`. For cloud deployment, the backend supports Cloudinary storage so item and campaign photos survive server restarts.

## Requirements

- Node.js 22.6 or newer (Node 24 is used for native TypeScript stripping).
- MySQL running locally, with a database named `reusehub`.
- Expo Go for device testing, or a web browser for the web preview.

## Backend setup

1. Create an empty MySQL database called `reusehub`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private random `JWT_SECRET` of at least 32 characters. Keep `.env` files private.
3. Install dependencies and apply the migration:

   ```powershell
   cd backend
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run db:seed
   npm start
   ```

   For watch mode, use `npm run dev`. The API listens on port 5000 by default. Check `http://localhost:5000/api/health`.

To enable admin access for an account you control, register and verify that account first, then promote only its email from the backend shell:

```powershell
$env:ADMIN_EMAIL = "you@example.edu"
npm run admin:promote
Remove-Item Env:ADMIN_EMAIL
```

## Mobile setup

1. Install packages:

   ```powershell
   cd mobile
   npm install
   ```

2. For a physical phone, copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_URL` to the computer’s LAN address, for example `http://192.168.1.23:5000/api`. Keep the phone and computer on the same Wi-Fi network. For web or an Android emulator, the app can use its local host defaults.
3. Start the app:

   ```powershell
   npm run web
   # or
   npx expo start
   ```

The API URL is configuration, not a secret. The JWT is stored in Expo SecureStore on native platforms and in tab `sessionStorage` on web.

## Free cloud deployment

See [docs/FREE_CLOUD_DEPLOYMENT.md](docs/FREE_CLOUD_DEPLOYMENT.md) for the free-tier setup using Render for the API, TiDB Cloud Starter for MySQL, and Cloudinary for persistent photos. Render's free API may sleep while idle, so the first request after inactivity can take about a minute. After the API is deployed, build a new APK with its public HTTPS API URL; existing APKs continue to use the API URL they were built with.

## Checks

```powershell
cd mobile
npm run typecheck
npm run lint
npx expo export --platform web
```

Backend endpoints are documented in `docs/ReUseHub.postman_collection.json`. Import the collection, set `baseUrl` to `http://localhost:5000/api`, register or log in, and the collection saves the returned token for subsequent requests. No production or demo user credentials are included.

## Main API routes

| Area | Routes |
| --- | --- |
| Health and auth | `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET/PUT /auth/me` |
| Categories and items | `GET /categories`, `GET/POST /items`, `GET/PUT/DELETE /items/:id`, `GET /items/mine`, `POST /items/:id/images` |
| Recommendations and wishlist | `GET /items/recommended`, `GET /wishlist`, `POST/DELETE /wishlist/:itemId` |
| Requests and handovers | `GET/POST /requests`, `POST /requests/:id/{accept,reject,cancel,complete}`, `POST /requests/:id/handover`, `PATCH /requests/:id/handover/response`, `POST /requests/:id/handover/code`, `POST /requests/:id/rating`, `GET /requests/reputation/:userId`. For an `EXCHANGE` listing, `POST /requests` requires both `itemId` and an owned, available `offeredItemId`. |
| Chat and lifecycle | `GET/POST /chats/:requestId/messages`, `GET /items/:id/lifecycle` |
| Donations | `GET /donations/mine`, `POST /donations/:itemId/{mark,complete}` |
| Community campaigns | `GET/POST /community/campaigns`, `GET /community/campaign-donations/mine`, `POST /community/campaigns/:id/donations`; legacy campaign contributions remain supported |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Sustainability | `GET /sustainability/me`, `GET /sustainability/campus`, `GET /sustainability/factors`, `GET /sustainability/methodology`, `GET /sustainability/leaderboard`, `GET /sustainability/items/:itemId/calculation` |
| Admin | `GET /admin/{stats,users,items,requests,metrics,reports,campaigns}`, `PATCH /admin/reports/:id`, `POST/PATCH/DELETE /admin/campaigns/:id`, `GET /admin/campaigns/:id/donations`, `PATCH /admin/campaign-donations/:id`, `POST /admin/campaigns/:id/image`, `DELETE /admin/items/:id` |

Responses use ordinary JSON objects; errors include an `error` message. Listing deletion is a recoverable status change, preserving request and transaction history.

## Green IT and limitations

- The item feed, search, and admin lists use server-side pagination and database filtering.
- Photos are resized to a maximum 1280 px edge and compressed before upload. Local development stores them on disk; cloud deployment stores them in Cloudinary.
- CO2e estimates use source-backed lifecycle reference factors and a configurable displacement assumption. The calculation and its limitations are described in [docs/sustainability-methodology.md](docs/sustainability-methodology.md). They are estimates, not measured savings or a complete LCA.
- The app does not collect campus energy or data-center measurements, so it does not claim actual PUE or energy savings.

## Feature status

The staged expansion includes the marketplace, saved listings, multi-image uploads, complete item detail photos with a swipeable full-screen viewer, recommendations, item-for-item exchanges that lock both offered items, multi-request handovers with buyer-generated codes, transaction chat, ratings, lifecycle events, user/item reporting with admin review, admin-controlled donation campaigns, activity-based achievements and goals, and sustainability dashboards. Completed transaction chats remain visible as read-only history. Green IT reports measured stored-image and API request metrics; it does not infer unmeasured energy savings. QR image generation and scanning are not yet implemented. There is no department-wise sustainability functionality. Cloud image storage is supported when configured; production deployment, email verification, and field validation of impact factors are not yet completed.

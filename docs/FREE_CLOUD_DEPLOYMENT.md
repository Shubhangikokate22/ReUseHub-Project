# ReUseHub free cloud deployment

This setup keeps the API, database, and uploaded photos online without relying on the laptop:

- **Render Free** runs the Express API using the blueprint in `render.yaml`.
- **TiDB Cloud Starter** provides MySQL-compatible storage. Keep its monthly spending limit at zero to stay within the free quota.
- **Cloudinary Free** stores item and donation-campaign images outside the API server.

Free services have limits. Render spins down its free API after 15 minutes without requests, and the next request can take about a minute to wake it. TiDB Cloud Starter includes 5 GiB row storage and 50 million request units per month; activity over quota is throttled when the spending limit is zero. Cloudinary Free includes 25 monthly credits shared between image storage, delivery bandwidth, and transformations. These tiers suit a student demo, not a guaranteed always-on production service.

## 1. Create the free services

1. Create a **TiDB Cloud Starter** instance and database named `reusehub`. Set its spending limit to zero. Copy its MySQL connection string. Set its network access control to allow connections from the Render API; if Render's free outbound IPs cannot be allow-listed individually, use TiDB's public endpoint with TLS and a unique, strong password.
2. Create a **Cloudinary** free account. From its Console, copy the cloud name, API key, and API secret. Keep the API secret private.
3. In Render, create a Blueprint deployment from this repository and select `render.yaml`. The API service uses `backend/` as its root directory. Choose the Free instance plan.

## 2. Configure and deploy the API

When Render asks for environment variables, set:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | TiDB's `mysql://user:password@host/reusehub` connection URL |
| `DATABASE_SSL` | `true` (the Blueprint sets this) |
| `JWT_SECRET` | Generate a new random secret of at least 32 characters; Render can generate one |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

The start command applies the checked-in Prisma migrations and runs the idempotent category/emission-factor seed before starting the API. Once Render reports the service as live, visit `https://<your-service>.onrender.com/api/health` and confirm it returns a success response.

## 3. Build a new APK for the cloud API

The current APK has the laptop's local API address bundled into it. Set the new Render HTTPS URL as `EXPO_PUBLIC_API_URL` in the **preview** environment on the linked EAS project (append `/api`), then start another Android build:

```powershell
cd C:\Projects\ReUseHub\mobile
npx eas-cli@latest build --platform android --profile preview
```

Install that newly built APK on the phones. Do not put database credentials, the JWT secret, or the Cloudinary API secret in the mobile app or EAS variables: only the public Render API URL belongs in the app build.

## Local development

Leave `DATABASE_SSL=false` and Cloudinary variables blank in `backend/.env` to keep local MySQL and local `backend/uploads` behavior. Production refuses to save uploaded photos locally when Cloudinary is not configured.

# EduRoute

EduRoute is a faculty trip management and monitoring platform for official locator slip processing, approval workflows, trip validation, live tracking, proof-of-compliance review, and institutional reporting.

The project is split into:

- a **Vite + React frontend** at the repository root and inside `eduroute_frontend/`
- an **Express + PostgreSQL backend** in `eduroute_backend/`

## Core Features

- Faculty locator slip filing
- Dean approval and rejection workflow
- CSSU exit validation
- HRMU trip verification and review
- Live trip tracking and route monitoring
- Proof of compliance submission
- Analytics, incidents, and PDF report generation
- Role-based notifications and audit-style activity

## Project Structure

```text
EduRoute/
|-- eduroute_backend/        # Express API, PostgreSQL access, migrations, reports
|-- eduroute_frontend/       # React app source
|-- public/                  # App icons, manifest, static assets
|-- design-system/           # Design reference materials
|-- package.json             # Frontend root package
|-- vite.config.js           # Frontend build configuration
```

## Technology Stack

### Frontend

- React
- Vite
- Mapbox GL
- Socket.IO client
- html2canvas / jsPDF

### Backend

- Node.js
- Express
- PostgreSQL
- Socket.IO
- Cloudinary
- Firebase Admin
- Nodemailer
- pdf-lib

## Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd EduRoute
```

### 2. Install frontend dependencies

From the repository root:

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd eduroute_backend
npm install
cd ..
```

## Environment Setup

### Frontend environment

Create a local frontend environment file based on:

- `C:\msys64\ucrt64\bin\.vscode\Thesis\Eduroute\.env.example`

Example:

```bash
copy .env.example .env.local
```

Required frontend values include:

- `VITE_API_BASE_URL`
- `VITE_MAPBOX_PUBLIC_TOKEN`
- Firebase web configuration values
- `VITE_FIREBASE_VAPID_KEY`

### Backend environment

Create a backend environment file based on:

- `C:\msys64\ucrt64\bin\.vscode\Thesis\Eduroute\eduroute_backend\.env.example`

Example:

```bash
copy eduroute_backend\.env.example eduroute_backend\.env
```

Important backend values include:

- `DATABASE_URL`
- `JWT_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `FRONTEND_URL`
- SMTP configuration
- Cloudinary credentials
- Map provider keys
- Firebase Admin credentials

Generate a local field-encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use a different `FIELD_ENCRYPTION_KEY` for local development and production. Never place this value in frontend environment files.

For stable encrypted auth request payloads in production, generate an RSA private key for the backend:

```bash
node -e "const { generateKeyPairSync } = require('crypto'); const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'))"
```

Place it in the backend environment only:

```env
AUTH_PAYLOAD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

If `AUTH_PAYLOAD_PRIVATE_KEY` is not configured locally, the backend generates a temporary runtime key for development testing.

## Deployment Checklist

Use the same repository root for the deployed frontend build. The frontend is built with:

```bash
npm install
npm run build
```

The Firebase messaging service worker lives in `public/firebase-messaging-sw.js`, so Vite copies it to `dist/firebase-messaging-sw.js` during deployment.

### Vercel frontend environment

Set these values in the deployed frontend environment:

- `VITE_API_BASE_URL=https://eduroute-production.up.railway.app`
- `VITE_MAPBOX_PUBLIC_TOKEN`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

All Firebase web values, including `VITE_FIREBASE_VAPID_KEY`, must come from the same Firebase project used by the deployed app.

### Railway backend environment

Set these values in the deployed backend environment:

- `DATABASE_URL`
- `JWT_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `AUTH_PAYLOAD_PRIVATE_KEY`
- `FRONTEND_URL=https://edu-route.vercel.app`
- `FRONTEND_URLS=https://edu-route.vercel.app`
- `CLIENT_ORIGIN=https://edu-route.vercel.app`
- `FCM_WEB_PUSH_LINK=https://edu-route.vercel.app`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- SMTP, Cloudinary, and map provider credentials

After changing Firebase web credentials, VAPID key, or service worker behavior, redeploy the frontend and refresh/reopen the installed PWA once so the browser can activate the latest worker.

## Database Setup

EduRoute uses PostgreSQL.

Make sure your target database exists before running migrations.

### Run backend migrations

From `eduroute_backend/`, run the scripts needed for your environment.

Common migrations:

```bash
npm run migrate:locator-slips
npm run migrate:profile-image
npm run migrate:permissions
npm run migrate:user-roles
npm run migrate:role-registration
npm run migrate:trips
npm run migrate:trip-tracking
npm run migrate:dean-dashboard
npm run migrate:hrmu-dashboard
npm run migrate:hrmu-analytics
npm run migrate:hrmu-live-tracking
npm run migrate:hrmu-reports-incidents
npm run migrate:faculty-trip-flow
npm run migrate:cssu-dashboard
npm run migrate:locator-slip-qr
npm run migrate:notifications-push
npm run migrate:smart-analytics
npm run migrate:trip-path-history
npm run migrate:field-encryption
node scripts/run-sql-file.js sql/cssu_scan_attempts.sql
```

### Latest database patches

The current implementation phase added new database support for HRMU smart analytics, recorded trip path history, CSSU scan auditing, and field-level encryption. Apply these patches to any local or Railway database that was created before the latest changes.

```bash
cd eduroute_backend
npm run migrate:smart-analytics
npm run migrate:trip-path-history
npm run migrate:field-encryption
node scripts/run-sql-file.js sql/cssu_scan_attempts.sql
```

These patches add or update:

- `trip_incidents` for HRMU incident signals such as late returns, missing proof, disconnected tracking, and unverified location issues.
- `trip_analytics` for generated smart analytics and trip risk scoring.
- `cssu_scan_attempts` for CSSU QR/manual scan history, rejected attempts, repeated attempts, and gate monitoring.
- `trip_location_logs.accuracy`, `trip_location_logs.source`, and `trip_location_logs.sync_status` for recorded GPS path history.
- Encrypted proof and review fields on `arrival_verifications` and `locator_slip_location_verifications` using AES-256-GCM payload, IV, and authentication tag columns.

If you are restoring an old Railway database into a new Railway database, restore the data first, then run the latest database patches above.

Important: keep the same `FIELD_ENCRYPTION_KEY` when moving an already encrypted database. Changing that key will prevent existing encrypted fields from being decrypted.

## Running the Project Locally

### Start the backend

```bash
cd eduroute_backend
npm run dev
```

Backend default:

- `http://localhost:5000`

### Start the frontend

From the repository root:

```bash
npm run dev
```

Frontend default:

- `http://localhost:5173`

## Build

### Frontend production build

```bash
npm run build
```

### Backend production start

```bash
cd eduroute_backend
npm start
```

## User Role Guide

EduRoute enforces role-based access. Each user only sees the workflows assigned to their institutional role.

### Faculty

Faculty users can:

- create and submit locator slips
- generate locator slip QR records
- start, continue, and complete official trips
- allow location tracking during active trips
- submit proof of compliance
- view trip summaries, statuses, and notifications

Faculty users should only access their own records.

### Dean

Dean users can:

- review locator slips for their assigned college
- approve or reject locator slip requests
- provide rejection reasons
- manage dean digital signature consent and upload
- view registry entries for their faculty members

Deans only handle requests under their assigned college.

### CSSU

CSSU users can:

- validate exit clearance
- monitor live exit and active trip activity
- view live map tracking for approved trips
- generate reports and send report PDFs to HRMU

CSSU focuses on validation, live monitoring, and operational reporting.

### HRMU

HRMU users can:

- monitor completed and active faculty trips
- review proof of compliance
- mark trips successful or flag issues
- inspect incident summaries
- access live tracking, analytics, and reports
- receive CSSU-submitted report attachments

HRMU acts as the central verification and reporting office.

### System Administrator

Authorized administrators can:

- manage technical maintenance
- maintain deployment and infrastructure settings
- support account and system-level operational tasks

Administrative access should be limited to approved system operators only.

## Reporting and Export

EduRoute supports export workflows for:

- HRMU reports
- HRMU analytics
- CSSU movement reports
- proof and verification PDF exports

Some exports depend on backend PDF generation and configured assets.

## Deployment Notes

### Frontend

The frontend is built with Vite and can be deployed to platforms like:

- Vercel
- Netlify

### Backend

The backend can be deployed to services like:

- Railway
- Render
- any Node.js host with PostgreSQL access

When deploying:

- make sure backend environment variables are present
- make sure the correct database migrations are applied
- confirm SMTP, Cloudinary, Firebase, and map service keys are configured

## Security Notes

- Do **not** commit `.env` or `.env.local`
- Do **not** commit Firebase service account secrets
- Do **not** commit Cloudinary, SMTP, JWT, or database secrets
- Commit only `.env.example` files for setup guidance

### Field-Level Encryption

EduRoute uses AES-256-GCM for backend-only field encryption of sensitive values that must remain readable later. Passwords are not encrypted with AES; they remain one-way hashed with bcrypt.

Login credentials are submitted to the backend over HTTPS in production so the server can verify the password against the bcrypt hash. EduRoute also encrypts auth request bodies in the browser using a hybrid RSA-OAEP/AES-256-GCM envelope so Network payloads contain `{ encryptedData, iv, authTag, encryptedKey }` instead of plaintext credentials. Passwords are still hashed only by the backend with bcrypt after decryption. Auth responses return sensitive profile metadata as AES-GCM envelopes using `{ encryptedData, iv, authTag }` while keeping the account role readable for portal routing.

Encrypted fields currently include:

- proof-of-compliance focal person name
- proof-of-compliance focal person position
- HRMU proof review remarks
- HRMU arrival/location review remarks
- login/register response profile metadata such as name, employee ID, email, department, profile image URL, and timestamps

The encrypted database layout stores each protected value as:

- encrypted payload
- IV/nonce
- authentication tag

Existing plaintext columns are kept temporarily for compatibility and old-record fallback. New writes use encrypted columns after `npm run migrate:field-encryption` is applied and `FIELD_ENCRYPTION_KEY` is configured. Do not expose encrypted payload, IV, auth tag, or encryption keys to the frontend.

To smoke-test the crypto utility:

```bash
cd eduroute_backend
npm run test:field-encryption
```

To test manually:

- Generate and set `FIELD_ENCRYPTION_KEY` in `eduroute_backend/.env`
- Run `npm run migrate:field-encryption`
- Submit proof of compliance with focal person details
- Review a proof or arrival verification with HRMU remarks
- Confirm the encrypted columns contain base64 values while normal authorized API responses still show readable values
- Confirm login/signup still works and `faculty_users.password_hash` remains bcrypt-hashed, not reversible AES

## Troubleshooting

### Frontend loads but API requests fail

Check:

- `VITE_API_BASE_URL`
- backend server is running
- CORS and frontend URL settings in backend `.env`

### PDF export errors

Check:

- backend dependencies are installed
- `pdf-lib` is available in the deployed backend
- required report assets exist

### Maps or route rendering fail

Check:

- `VITE_MAPBOX_PUBLIC_TOKEN`
- `MAPBOX_SECRET_TOKEN`
- route and location data exist for the trip

### Email recovery fails

Check:

- `SMTP_USER`
- `SMTP_PASS`
- app-password or provider credentials

## Maintenance Guidance

Before pushing to GitHub:

- keep source files, migrations, docs, and configuration templates
- exclude `node_modules/`, `dist/`, `.env`, and local debug files

## License

This project is intended for institutional academic and operational use.

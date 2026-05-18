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
- `FRONTEND_URL`
- SMTP configuration
- Cloudinary credentials
- Map provider keys
- Firebase Admin credentials

## Database Setup

EduRoute uses PostgreSQL.

Make sure your target database exists before running migrations.

### Run backend migrations

From `eduroute_backend/`, run the scripts needed for your environment.

Common migrations:

```bash
npm run migrate:locator-slips
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
```

If your deployment includes newer tables stored in `eduroute_backend/sql/`, apply those as needed in your database host as part of deployment.

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

This project is intended for institutional academic and operational use. Add your official license terms here if the repository will be shared externally.

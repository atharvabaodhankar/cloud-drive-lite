# CloudDrive Lite 🚀

An ultra-sleek, premium monochrome cloud storage dashboard connected to a secure Express.js backend using S3-compatible DigitalOcean Spaces storage and PostgreSQL database management.

This project is built with **Node.js/Express**, **PostgreSQL**, **React 19**, **Vite 8**, **Tailwind CSS v4**, and **Framer Motion**.

---

## 📂 Project Structure

```
cloud-drive-lite/
├── backend/
│   ├── .env                  # Backend credentials and configuration
│   ├── db.js                 # PostgreSQL connection pool & automatic table migrations
│   ├── server.js             # Secure Express.js API
│   └── package.json          # Server dependencies
├── frontend/
│   ├── .env                  # Frontend environment pointing to backend API
│   ├── src/
│   │   ├── App.jsx           # Premium monochrome dashboard & Authentication UI
│   │   ├── index.css         # Tailwind v4 configuration and custom styles
│   │   └── main.jsx          # App entry point
│   ├── vite.config.js        # Vite & Tailwind compiler settings
│   └── package.json          # Client dependencies
└── docker-compose.yml        # PostgreSQL service container definition
```

---

## ✨ Features

### 🖥️ Premium Monochrome UI
* **High-Fidelity Aesthetics**: Sleek glassmorphism panels, customized rounded scrollbars, carbon-dark body, and a subtle glowing backdrop grid.
* **100% Animated (Framer Motion)**: Smooth fade-ins, spring-based hover scales, custom Toast notifications, and exit card collapse animations on file deletions.
* **Real-time Progress Tracker**: Interactive drag-and-drop zone that updates in real-time with progress bar percentages based on native browser upload bytes (`XMLHttpRequest`).
* **Visual Delight**: Celebratory confetti explosions on successful uploads using `canvas-confetti`.
* **Activity Logs Drawer**: A sliding side drawer panel showing your chronological audit history logs (uploads, deletions, downloads, password resets, logins) retrieved directly from the database.

### 🔒 Secure Multi-Tenant Architecture & DB
* **User Accounts & Auth**: Registration and login using `bcryptjs` salted password hashing and secure token validations.
* **JWT Access & Refresh Token Rotation**:
  * Short-lived `Access Token` (15m expiry) handles standard requests.
  * Long-lived `Refresh Token` (7d expiry) is saved in the database to retrieve new access tokens.
  * The frontend client features a background interceptor that automatically rotates tokens and retries failed requests without interrupting the user.
* **Password Recovery (Mocked Email)**: Trigger password recovery requests to save an active token in the database and print recovery links directly in the backend terminal console.
* **Disk Quota Enforcement**: Aggregates used storage (`SUM(size)`) and rejects uploads if the new file size pushes the account past the 100MB quota.
* **Isolated User Folders**: All uploads are nested within user-specific folders inside the S3 bucket (`users/<user_id>/<file>`). Endpoints enforce that users can only view, download, or delete their own files.
* **Presigned S3 URLs**: Files are stored privately. The backend dynamically constructs temporary, signed GET URLs that expire in **1 hour** for secure downloads.
* **CORS & Helmet**: Dynamic dev whitelist whitelists local Vite ports automatically. Helmet ensures secure HTTP headers.

---

## ⚙️ Configuration (.env)

### Backend Settings (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```env
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
MAX_FILE_SIZE=26214400
RATE_LIMIT_MAX=200

DB_HOST=localhost
DB_PORT=5432
DB_USER=clouddrive_user
DB_PASSWORD=clouddrive_password
DB_NAME=clouddrive

JWT_SECRET=super_secret_monochrome_drive_key_2026

SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=atharva-cloudlab
SPACES_KEY=your_digitalocean_access_key
SPACES_SECRET=your_digitalocean_secret_key
```

### Frontend Settings (`frontend/.env`)
Create a `.env` file in the `frontend/` directory:
```env
VITE_API_URL=http://localhost:3000
```

---

## 🚀 Running Locally

### Prerequisite
Ensure you have [Node.js](https://nodejs.org/) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### 1. Spin up the Database
In the root directory, launch the PostgreSQL database container:
```bash
docker compose up -d
```

### 2. Run the Backend Server
```bash
cd backend
npm install
node server.js
```
The console will verify the database connection and boot the Express server:
```
[Database] PostgreSQL connection established successfully.
[Database] Production schema migrations verified / initialized.
[CloudDrive Lite Secure API] Listening on port 3000
```

### 3. Run the Frontend Client
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open the local URL displayed in the terminal (usually `http://localhost:5173` or `http://localhost:5174`).

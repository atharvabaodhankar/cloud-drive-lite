# CloudDrive Lite 🚀

An ultra-sleek, premium monochrome cloud storage dashboard connected to a secure Express.js backend using S3-compatible DigitalOcean Spaces storage.

This project is built with **Node.js/Express**, **React 19**, **Vite 8**, **Tailwind CSS v4**, and **Framer Motion**.

---

## 📂 Project Structure

```
cloud-drive-lite/
├── backend/
│   ├── .env                  # Backend credentials and configuration
│   ├── server.js             # Secure Express.js API
│   └── package.json          # Server dependencies
└── frontend/
    ├── .env                  # Frontend environment pointing to backend API
    ├── src/
    │   ├── App.jsx           # Main premium monochrome dashboard UI
    │   ├── index.css         # Tailwind v4 configuration and custom styles
    │   └── main.jsx          # App entry point
    ├── vite.config.js        # Vite & Tailwind compiler settings
    └── package.json          # Client dependencies
```

---

## ✨ Features

### 🖥️ Premium Monochrome UI
* **High-Fidelity Aesthetics**: Sleek glassmorphism panels, customized rounded scrollbars, carbon-dark body, and a subtle glowing backdrop grid.
* **100% Animated (Framer Motion)**: Smooth fade-ins, spring-based hover scales, custom Toast notifications, and exit card collapse animations on file deletions.
* **Real-time Progress Tracker**: Interactive drag-and-drop zone that updates in real-time with progress bar percentages based on native browser upload bytes (`XMLHttpRequest`).
* **Visual Delight**: Celebratory confetti explosions on successful uploads using `canvas-confetti`.
* **Search & Sorting**: Instant search bar with dropdown selectors to sort files by Date (Newest/Oldest) or Size (Largest/Smallest), plus file type classification filters (Images, Documents, Archives, Media, Others).

### 🔒 Enhanced Security Implementations
* **Presigned S3 URLs**: Files are stored privately in S3 (no public read ACLs). The backend dynamically constructs temporary, signed GET URLs that expire in **1 hour** for secure downloads and link sharing.
* **Dynamic CORS**: Blocks unauthorized external domains, while securely whitelisting localhost development ports dynamically.
* **Helmet Middleware**: Configures HTTP headers securely to defend against common vulnerabilities.
* **IP Rate Limiting**: Mitigates DDoS attacks and spam requests by limiting client IPs to a maximum of 100 requests per 15 minutes.
* **Key Sanitization**: Prevents path traversal and S3 key encoding breakage by stripping dangerous characters from uploaded filenames.
* **File Size Validation**: Multer middleware strictly rejects files exceeding the 25MB limit.

---

## ⚙️ Configuration (.env)

### Backend Settings (`backend/.env`)
Create a file named `.env` inside the `backend/` directory:
```env
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
MAX_FILE_SIZE=26214400
RATE_LIMIT_MAX=100

SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=atharva-cloudlab
SPACES_KEY=your_digitalocean_access_key
SPACES_SECRET=your_digitalocean_secret_key
```

### Frontend Settings (`frontend/.env`)
Create a file named `.env` inside the `frontend/` directory:
```env
VITE_API_URL=http://localhost:3000
```

---

## 🚀 Running Locally

### Prerequisite
Ensure you have [Node.js](https://nodejs.org/) installed.

### 1. Run the Backend Server
```bash
cd backend
npm install
node server.js
```
The console will output:
`[CloudDrive Lite Backend] Running securely on port 3000`

### 2. Run the Frontend Client
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open the local URL displayed in the terminal (usually `http://localhost:5173` or `http://localhost:5174`).

---

## ⚠️ Important Architecture Note
This version of CloudDrive Lite operates on a **shared-bucket** architecture. It does **not** feature a database or user authentication. Consequently, **anyone** who opens the frontend will see, can download, and can delete all files currently residing in the connected DigitalOcean Spaces bucket.

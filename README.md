# CloudDrive Lite 🚀

CloudDrive Lite is a secure, single-page cloud storage dashboard connected to an Express.js backend. It features a dark-themed monochrome dashboard, secure JWT authentication with refresh token rotation, disk quota enforcement, PostgreSQL database logging, and S3-compatible cloud storage integration.

The entire application is containerized using Docker and orchestrated with Docker Compose. A pre-configured GitHub Actions pipeline provides automated CI/CD deployment to a Virtual Private Server (VPS) via SSH on every push to the `main` branch.

---

## 🏗️ System Architecture

The application uses a containerized multi-tier architecture. It isolates the database within a private network boundary, exposes the backend through a containerized reverse proxy, and stores files in an external S3-compatible object storage bucket.

### Component Deployment & Network Flow
The following diagram illustrates the deployment topology on a VPS, the Docker network boundary, and how external requests are routed.

```mermaid
graph TD
    Client[Client Browser] -->|HTTP request on port 5173| Nginx[Nginx Container: Port 80]
    
    subgraph Docker Network [Docker Compose Bridge Network]
        Nginx -->|Serves Static Assets| FE[React Frontend Build]
        Nginx -->|Proxies /api/* to http://backend:3000/*| BE[Express Backend Container: Port 3000]
        BE -->|Port 5432: Internal TCP Connection| DB[(PostgreSQL Container: Port 5432)]
    end
    
    BE -->|AWS SDK v3: PutObject / GetObject / DeleteObject| S3[DigitalOcean Spaces S3]
    
    Developer[Developer] -->|git push main| GitHub[GitHub Repository]
    GitHub -->|GitHub Actions Runner| VPS[VPS Host]
    VPS -->|SSH script: git pull & docker compose up --build| DockerNetwork
```

### 🔑 JWT Authentication & Refresh Token Rotation Flow
Authentication is managed via short-lived Access Tokens (15-minute expiry) and long-lived Refresh Tokens (7-day expiry) stored in the PostgreSQL database. The frontend contains an interceptor that handles session extension transparently.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Frontend (App.jsx)
    participant Server as Express Server (server.js)
    participant DB as PostgreSQL (db.js)

    Note over Client,Server: User Authentication
    Client->>Server: POST /auth/login (email, password)
    Server->>DB: Query user & verify bcrypt hash
    DB-->>Server: User verified
    Server->>Server: Generate Access Token (15m) & Refresh Token (7d)
    Server->>DB: Store Refresh Token in refresh_tokens table
    Server-->>Client: Return Access Token, Refresh Token & User Metadata
    Client->>Client: Save tokens in localStorage

    Note over Client,Server: Standard Operations
    Client->>Server: GET /files (Authorization: Bearer Access Token)
    alt Access Token is Valid
        Server-->>Client: 200 OK (User files list)
    else Access Token is Expired
        Server-->>Client: 403 Forbidden (Token expired or invalid)
        Note over Client: fetch interceptor catches 403 response
        Client->>Server: POST /auth/refresh (body: Refresh Token)
        Server->>DB: Verify Refresh Token in database & check expiration
        DB-->>Server: Token is valid
        Server->>Server: Generate New Access Token (15m)
        Server-->>Client: Return New Access Token
        Client->>Client: Update Access Token in localStorage
        Client->>Server: Retry original GET /files (Authorization: Bearer New Access Token)
        Server-->>Client: 200 OK (User files list)
    end
```

### 📁 File Upload & Quota Enforcement Flow
The backend enforces a strict storage quota of 100MB per user. It aggregates the sizes of all files currently owned by the user in the database before accepting new file buffers.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Frontend (App.jsx)
    participant Server as Express Server (server.js)
    participant DB as PostgreSQL (db.js)
    participant S3 as DigitalOcean Spaces

    Client->>Server: POST /upload (FormData: File)
    Server->>DB: Query SUM(size) of files where user_id = current_user
    DB-->>Server: Total used bytes
    Server->>DB: Query quota_limit for user (default 100MB)
    DB-->>Server: Quota limit in bytes
    
    alt Total Used + File Size > Quota Limit
        Server-->>Client: 400 Bad Request (Storage quota exceeded)
    else Storage Available
        Server->>S3: Upload file buffer (Key: users/user_id/timestamp-filename)
        S3-->>Server: Upload confirmation
        Server->>DB: INSERT file metadata (filename, size, storage_key, mime_type)
        DB-->>Server: Metadata record saved
        Server->>DB: INSERT into activities table (action: 'Uploaded file: filename')
        Server->>S3: Generate Presigned GET URL (1-hour expiry)
        Server-->>Client: 201 Created (File metadata + Presigned GET URL)
    end
```

---

## 🛠️ Technology Stack

### Frontend
* **React 19**: Component-based user interface management.
* **Vite 8**: Frontend compiler and development server.
* **Tailwind CSS v4**: Styling framework with CSS-variable-based utility styles.
* **Framer Motion**: Fluid spring physics, enter/exit transitions, drawer slide-overs, and card animations.
* **Lucide React**: Icon library for visual indicators.
* **Canvas Confetti**: Celebration triggers on successful operations.

### Backend
* **Node.js & Express.js (v5)**: REST API runtime and routing.
* **Multer**: Memory storage engine for handling incoming multipart form-data file uploads.
* **pg (node-postgres)**: PostgreSQL client connection pool.
* **jsonwebtoken & bcryptjs**: Secure password hashing and token generation.
* **Helmet & Express Rate Limit**: Security headers and API request throttling.
* **AWS SDK v3 (`@aws-sdk/client-s3`)**: SDK for interacting with S3-compatible DigitalOcean Spaces.
* **AWS S3 Request Presigner**: Generation of time-limited secure URLs.

### Database & Storage
* **PostgreSQL 15 (Alpine)**: Relational database storing users, files, tokens, and audit logs.
* **DigitalOcean Spaces**: S3-compatible cloud object storage.

### Deployment & Orchestration
* **Docker & Docker Compose**: Containerization and multi-service environment setup.
* **Nginx (Alpine)**: Embedded in the frontend container to serve static assets and route API requests.
* **GitHub Actions**: Pipeline runner for CI/CD.

---

## ✨ Features and Implementation Details

### 🔒 Security and Access Control
* **Isolated Storage Directory**: Users are restricted to their own directory in the S3 bucket (`users/<user_id>/`). Endpoints check ownership before reading, downloading, or deleting.
* **Private S3 Buckets**: Public read access to the S3 bucket is disabled. Files are accessed via presigned GET URLs that expire automatically after one hour.
* **Database Schema Auto-Migrations**: On boot, `db.js` runs queries to verify that the tables (`users`, `files`, `refresh_tokens`, `password_resets`, `activities`) exist. It automatically creates them and adds the necessary columns if missing.
* **Health Check**: An unauthenticated `/health` endpoint executes `SELECT 1` on the PostgreSQL connection to monitor database health and returns system uptime.
* **Database Isolation**: The PostgreSQL container exposes port 5432 internally. It cannot be accessed directly from the public internet, protecting the database from external connection attempts. Only the containerized backend can query it.
* **Mock Password Recovery**: Triggers a recovery flow that stores a temporary reset token in the database and prints a functional recovery link to the backend console, avoiding third-party mailer configurations for local developers.

### 🖥️ Frontend UX and Interactions
* **Monochrome Interface**: Designed with custom rounded scrollbars, carbon-dark body, and a subtle glowing backdrop grid.
* **Upload Progress Tracker**: Uses native `XMLHttpRequest` event listeners inside `App.jsx` to update a progress bar in real-time as bytes are sent to the server.
* **Axios-like Fetch Interceptor**: An `authenticatedFetch` wrapper intercepts 403 Forbidden responses, calls `/auth/refresh` to rotate the access token, and retries the failed operation without forcing a page refresh.
* **Activity Logs Drawer**: A sliding side drawer panel displays a user's audit logs, keeping track of logins, uploads, downloads, deletions, and password resets.

---

## 📦 Containerization and Service Orchestration

The application uses a multi-container environment configured in the root [docker-compose.yml](file:///c:/Users/baodh/OneDrive/Desktop/Projects/cloud-drive-lite/docker-compose.yml).

### 1. Database Service (`postgres`)
* Image: `postgres:15-alpine`
* Volume: `pgdata` mounted to `/var/lib/postgresql/data` for data persistence.
* Healthcheck: Executes `pg_isready` to ensure the database is fully initialized before dependent containers start.

### 2. Backend Service (`backend`)
* Build context: `./backend` (uses [backend/Dockerfile](file:///c:/Users/baodh/OneDrive/Desktop/Projects/cloud-drive-lite/backend/Dockerfile))
* Environment: Loads variables from `backend/.env`.
* Startup: Waits for the `postgres` container to be healthy.
* Healthcheck: Uses `wget` to query `http://localhost:3000/health`.

### 3. Frontend Service (`frontend`)
* Build context: `./frontend` (uses [frontend/Dockerfile](file:///c:/Users/baodh/OneDrive/Desktop/Projects/cloud-drive-lite/frontend/Dockerfile))
* Build Argument: Passes `VITE_API_URL=/api`.
* Port Mapping: Maps host port `5173` to container port `80`.
* Startup: Waits for the `backend` container to be healthy.
* **Dual-Stage Dockerfile**:
  * **Stage 1 (Build)**: Installs Node dependencies, copies source files, and runs `npm run build` to generate optimized static files in the `/app/dist` directory.
  * **Stage 2 (Production)**: Copies the built static files into an `nginx:alpine` image and replaces the default configuration with [nginx.conf](file:///c:/Users/baodh/OneDrive/Desktop/Projects/cloud-drive-lite/frontend/nginx.conf).

### 🔄 Nginx Reverse Proxy Configuration
Inside the frontend container, Nginx acts as a reverse proxy. It serves the static React application for root requests and proxies `/api/*` requests directly to the backend container, stripping the `/api` prefix:

```nginx
server {
    listen 80;
    client_max_body_size 100M;
    
    # Serve React static assets
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy to backend API container
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## ⚙️ Configuration (.env)

Before launching the application, configure the environment variables in both the backend and frontend directories.

### Backend Settings (`backend/.env`)
Create `backend/.env` with the following variables:
```env
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
MAX_FILE_SIZE=26214400
RATE_LIMIT_MAX=200

# Database Configuration (matches docker-compose)
DB_HOST=postgres
DB_PORT=5432
DB_USER=clouddrive_user
DB_PASSWORD=clouddrive_password
DB_NAME=clouddrive

# JWT Signing Key
JWT_SECRET=your_jwt_secret_signing_key

# DigitalOcean Spaces (S3) Configuration
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=your_spaces_bucket_name
SPACES_KEY=your_digitalocean_access_key
SPACES_SECRET=your_digitalocean_secret_key
```

### Frontend Settings (`frontend/.env`)
Create `frontend/.env` to configure the API base URL:
* **For Docker Compose (Production/Containerized)**:
  ```env
  VITE_API_URL=/api
  ```
* **For Local Development (Non-containerized)**:
  ```env
  VITE_API_URL=http://localhost:3000
  ```

---

## 🚀 Running Locally

### Approach A: Fully Containerized (Docker Compose)
This is the recommended method. It spins up all services, networks, and persistent volumes in a single command.

1. Ensure Docker and Docker Desktop are running.
2. Configure your environment files (`backend/.env` and `frontend/.env`).
3. Run the following command in the root directory:
   ```bash
   docker compose up -d --build
   ```
4. Access the dashboard in your web browser at `http://localhost:5173`.
5. View container logs using:
   ```bash
   docker compose logs -f
   ```

### Approach B: Native Local Development (No Containers)
If you prefer to run the components directly on your host machine:

1. **Start PostgreSQL**: Set up a local PostgreSQL instance and create a database named `clouddrive`. Update `DB_HOST=localhost` in `backend/.env`.
2. **Start the Backend**:
   ```bash
   cd backend
   npm install
   node server.js
   ```
   *The server will automatically run migrations and print database connection confirmations.*
3. **Start the Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open the local address provided by Vite (usually `http://localhost:5173`).

---

## 🖥️ Production VPS Deployment Setup

Deploying CloudDrive Lite to a cloud provider VPS (e.g., DigitalOcean, Linode, AWS EC2) involves configuring the server, cloning the repository, and setting up an external reverse proxy to handle SSL certificates.

### 1. VPS Server Requirements
* **OS**: Ubuntu 22.04 LTS or 24.04 LTS.
* **Hardware**: Minimum 1 vCPU and 1GB RAM.
* **Dependencies**: Docker, Docker Compose, Git, and Nginx installed on the host.

### 2. Initial VPS Setup
Log in to your VPS and install the required dependencies:

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y
sudo systemctl enable --now docker

# Add your user to the docker group (to run docker without sudo)
sudo usermod -aG docker $USER
newgrp docker

# Install Git
sudo apt install git -y

# Clone the repository to the home directory
cd ~
git clone https://github.com/yourusername/cloud-drive-lite.git
cd cloud-drive-lite
```

### 3. Configure Production Environment Variables
Create your production `.env` file inside the `backend` directory:
```bash
nano backend/.env
```
Paste your production configurations, making sure to use secure values for `JWT_SECRET` and your real `SPACES_KEY` and `SPACES_SECRET`.

Ensure `frontend/.env` has `VITE_API_URL=/api` so Nginx routing operates correctly.

### 4. Configure External Nginx and SSL (Certbot)
To secure the application with HTTPS (SSL) on your custom domain (e.g., `drive.yourdomain.com`), configure the host's Nginx server to forward requests to the Docker frontend container.

1. **Install Nginx and Certbot**:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx -y
   ```
2. **Configure Nginx Server Block**:
   Create a configuration file for your domain:
   ```bash
   sudo nano /etc/nginx/sites-available/cloud-drive-lite
   ```
   Paste the following configuration (replace `drive.yourdomain.com` with your domain):
   ```nginx
   server {
       listen 80;
       server_name drive.yourdomain.com;
       client_max_body_size 100M;

       location / {
           proxy_pass http://127.0.0.1:5173;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
3. **Enable the Configuration**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/cloud-drive-lite /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
4. **Obtain SSL Certificate**:
   Run Certbot to request and configure an SSL certificate from Let's Encrypt:
   ```bash
   sudo certbot --nginx -d drive.yourdomain.com
   ```
   *Certbot will automatically modify the Nginx configuration to support HTTPS and redirect HTTP traffic.*

---

## 🔁 CI/CD Pipeline (GitHub Actions)

CloudDrive Lite includes an automated deployment pipeline configured in [.github/workflows/deploy.yml](file:///c:/Users/baodh/OneDrive/Desktop/Projects/cloud-drive-lite/.github/workflows/deploy.yml).

### Workflow Mechanics
Whenever code is pushed to the `main` branch, the pipeline:
1. Provisions a runner using the `ubuntu-latest` image.
2. Initiates an SSH connection to the VPS using `appleboy/ssh-action@v1.0.3`.
3. Executes a shell script on the VPS to pull the latest commits and rebuild the Docker containers.

### Deployment Script
The commands executed on the VPS are:
```bash
cd ~/cloud-drive-lite          # Navigate to the repository directory
git pull origin main           # Pull the latest commits from GitHub
docker compose up -d --build   # Rebuild and restart the containerized services in the background
```

### 🔐 Pipeline Setup Instructions

To enable automated deployments, you must configure SSH keys and save them as GitHub repository secrets.

#### Step 1: Generate SSH Keys on your Local Machine or VPS
If you do not have an SSH key pair, generate one:
```bash
ssh-keygen -t ed25519 -C "deploy@clouddrive"
```
This produces a private key (`id_ed25519`) and a public key (`id_ed25519.pub`).

#### Step 2: Add the Public Key to the VPS
Append the contents of the public key (`id_ed25519.pub`) to the authorized keys file on the VPS:
```bash
cat id_ed25519.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

#### Step 3: Add GitHub Secrets
Navigate to your repository on GitHub, go to **Settings > Secrets and variables > Actions**, and add the following repository secrets:

1. `HOST`: The public IP address or domain name of your VPS.
2. `USERNAME`: The SSH user account used to log in (e.g., `root` or a dedicated deployment user).
3. `SSH_KEY`: The complete text contents of the **private key** (`id_ed25519`). Ensure you copy the entire block, including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines.

Once configured, any push to the `main` branch triggers the workflow, deploying updates to your VPS.

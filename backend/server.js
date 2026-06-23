require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Import PostgreSQL Database helper
const { pool, initDb } = require("./db");

// 1. Validate Environment Variables on Startup
const requiredEnv = [
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_KEY",
  "SPACES_SECRET",
  "JWT_SECRET"
];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error("FATAL ERROR: Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

// 2. Initialize S3 Client (DigitalOcean Spaces)
const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

const app = express();

// Parse JSON request payloads
app.use(express.json());

// 3. Security Middlewares
// Helmet to secure headers
app.use(helmet());

// Configure CORS to support dynamic localhost ports during development
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost || origin === allowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error("CORS Policy Violation: Origin not whitelisted"));
    }
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Apply Rate Limiter to protect all API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

// 4. File Upload Configuration (Multer with 25MB limits)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "26214400"); // 25MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1
  }
});

// Helper to sanitize filenames to prevent path traversal in S3 keys
const sanitizeKey = (originalName) => {
  if (!originalName) return `${Date.now()}-unnamed`;
  const baseName = originalName.replace(/^.*[\\\/]/, "");
  const cleanName = baseName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${Date.now()}-${cleanName}`;
};

// 5. Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication token missing."
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: "Invalid or expired token."
      });
    }
    req.user = user;
    next();
  });
};

// 6. REST API Endpoints

// Root status endpoint
app.get("/", (req, res) => {
  res.json({
    name: "CloudDrive Lite Secure DB Backend",
    status: "online",
    storageType: "DigitalOcean Spaces",
    database: "PostgreSQL"
  });
});

// --- AUTH ROUTING ---

// User Registration
app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 6 characters long."
    });
  }

  try {
    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Save user to PostgreSQL database
    const query = `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
    `;
    const dbRes = await pool.query(query, [email.toLowerCase(), passwordHash]);
    const newUser = dbRes.rows[0];

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: {
        id: newUser.id,
        email: newUser.email
      }
    });

  } catch (err) {
    // Handle unique constraint violation on email
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email is already registered."
      });
    }
    
    console.error("Registration error:", err);
    res.status(500).json({
      success: false,
      error: "An error occurred during registration."
    });
  }
});

// User Login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required."
    });
  }

  try {
    // Retrieve user from DB
    const dbRes = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (dbRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password."
      });
    }

    const user = dbRes.rows[0];

    // Verify password hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password."
      });
    }

    // Generate JWT Token (valid for 24 hours)
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      error: "An error occurred during login."
    });
  }
});

// --- FILE ROUTING (SECURED WITH JWT & DATABASE FILTERING) ---

// List User-Owned Files (Phase 1 + 2)
app.get("/files", authenticateToken, async (req, res) => {
  try {
    // Fetch file records owned by the current logged-in user
    const dbRes = await pool.query(
      "SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    const dbFiles = dbRes.rows;

    // Generate temporary presigned download links for each file
    const files = await Promise.all(dbFiles.map(async (file) => {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: file.storage_key
      });

      // Generate a presigned URL valid for 1 hour (3600 seconds)
      const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

      return {
        id: file.id,
        key: file.storage_key,
        filename: file.filename,
        size: parseInt(file.size),
        lastModified: file.created_at,
        url: downloadUrl
      };
    }));

    res.json({
      success: true,
      count: files.length,
      files
    });

  } catch (err) {
    console.error("List files error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve user files."
    });
  }
});

// Secure File Upload (Phase 3: Nested folders inside S3)
app.post(
  "/upload",
  authenticateToken,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            error: `File size exceeds the limit of ${(maxFileSize / (1024 * 1024)).toFixed(1)}MB.`
          });
        }
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file was uploaded."
        });
      }

      // Structure object keys by user ID inside S3: users/<user-id>/<timestamp>-<sanitized-filename>
      const cleanName = sanitizeKey(file.originalname);
      const storageKey = `users/${req.user.id}/${cleanName}`;

      // Upload file to Space privately (no public-read ACL)
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      );

      // Save file metadata in PostgreSQL database
      const query = `
        INSERT INTO files (user_id, filename, storage_key, size, mime_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, filename, storage_key, size, created_at
      `;
      const dbRes = await pool.query(query, [
        req.user.id,
        file.originalname,
        storageKey,
        file.size,
        file.mimetype
      ]);
      const savedFile = dbRes.rows[0];

      // Generate a temporary presigned URL for this new file
      const getCommand = new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: storageKey
      });
      const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

      res.status(201).json({
        success: true,
        message: "File uploaded securely.",
        file: {
          id: savedFile.id,
          key: savedFile.storage_key,
          filename: savedFile.filename,
          size: parseInt(savedFile.size),
          lastModified: savedFile.created_at,
          url: downloadUrl
        }
      });

    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to upload and catalog file."
      });
    }
  }
);

// Secure File Deletion
app.delete("/files/:key", authenticateToken, async (req, res) => {
  try {
    const key = req.params.key;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required."
      });
    }

    // Verify ownership of the file before removing it
    const fileQuery = "SELECT * FROM files WHERE storage_key = $1 AND user_id = $2";
    const fileCheck = await pool.query(fileQuery, [key, req.user.id]);
    
    if (fileCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access: You do not own this file."
      });
    }

    // 1. Delete from DigitalOcean Spaces
    const command = new DeleteObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key
    });
    await s3.send(command);

    // 2. Delete metadata from Database
    await pool.query("DELETE FROM files WHERE storage_key = $1 AND user_id = $2", [key, req.user.id]);

    res.json({
      success: true,
      message: "File deleted securely.",
      key
    });

  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete file."
    });
  }
});

// 7. Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    error: "An internal server error occurred."
  });
});

// Start Server after connecting to Database and running migrations
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[CloudDrive Lite Secure API] Listening on port ${PORT}`);
    console.log(`[CORS] Dynamic Dev Whitelist & Whitelisted Origin: ${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}`);
    console.log(`[Database] PostgreSQL database is connected and migrated.`);
  });
});
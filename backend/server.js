require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Import PostgreSQL Helper
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
app.use(helmet());

// CORS Whitelisting
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

// Unauthenticated Health Check Endpoint (Bypasses Rate Limiter to prevent false positives)
app.get("/health", async (req, res) => {
  try {
    // Audit database connectivity
    await pool.query("SELECT 1");
    res.json({
      status: "healthy",
      database: "connected",
      uptime: process.uptime(),
      timestamp: new Date()
    });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: err.message
    });
  }
});

// Apply Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "200"), // Increased for auth polling/refresh requests
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

// 4. File Upload Configuration (Multer)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "26214400"); // 25MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1
  }
});

// Helper to sanitize filenames
const sanitizeKey = (originalName) => {
  if (!originalName) return `${Date.now()}-unnamed`;
  const baseName = originalName.replace(/^.*[\\\/]/, "");
  const cleanName = baseName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${Date.now()}-${cleanName}`;
};

// 5. Auth Token Helpers
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m" } // 15-minute expiry
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } // 7-day expiry
  );
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

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
        error: "Access token expired or invalid."
      });
    }
    req.user = user;
    next();
  });
};

// Activity Logging Helper
const logActivity = async (userId, action) => {
  try {
    await pool.query(
      "INSERT INTO activities (user_id, action) VALUES ($1, $2)",
      [userId, action]
    );
  } catch (err) {
    console.error("[Activity Logger] Error logging action:", err);
  }
};

// 6. REST API Endpoints

// Root status endpoint
app.get("/", (req, res) => {
  res.json({
    name: "CloudDrive Lite Secure Production API",
    status: "online",
    storageType: "DigitalOcean Spaces",
    database: "PostgreSQL",
    quotaDefault: "100MB"
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
    const passwordHash = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, quota_limit
    `;
    const dbRes = await pool.query(query, [email.toLowerCase(), passwordHash]);
    const newUser = dbRes.rows[0];

    // Log Activity
    await logActivity(newUser.id, "Registered account successfully");

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: {
        id: newUser.id,
        email: newUser.email
      }
    });

  } catch (err) {
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

// User Login with Access & Refresh Token Rotation
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required."
    });
  }

  try {
    const dbRes = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (dbRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password."
      });
    }

    const user = dbRes.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password."
      });
    }

    // Generate Access & Refresh Tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save Refresh Token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Valid for 7 days
    await pool.query(
      "INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [refreshToken, user.id, expiresAt]
    );

    // Log Activity
    await logActivity(user.id, "Logged in securely");

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        quotaLimit: parseInt(user.quota_limit)
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

// Refresh Access Token
app.post("/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: "Refresh token is required."
    });
  }

  try {
    // Check if token exists in DB and is valid
    const dbRes = await pool.query(
      "SELECT * FROM refresh_tokens WHERE token = $1",
      [refreshToken]
    );

    if (dbRes.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Invalid refresh token."
      });
    }

    const tokenRow = dbRes.rows[0];

    if (new Date() > new Date(tokenRow.expires_at)) {
      // Clean up expired token
      await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
      return res.status(403).json({
        success: false,
        error: "Expired refresh token."
      });
    }

    // Verify JWT
    jwt.verify(refreshToken, process.env.JWT_SECRET, (err, userDecoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          error: "Invalid token signature."
        });
      }

      // Generate new short-lived access token
      const accessToken = generateAccessToken(userDecoded);
      res.json({
        success: true,
        accessToken
      });
    });

  } catch (err) {
    console.error("Token refresh error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to rotate token."
    });
  }
});

// User Logout (Invalidate Refresh Token)
app.post("/auth/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, error: "Refresh token required." });
  }

  try {
    // Delete token from database
    await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
    res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, error: "Logout failed." });
  }
});

// Forgot Password (Generate Reset link and print in terminal console)
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required." });
  }

  try {
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (userRes.rows.length === 0) {
      // Return success even if email is not found to prevent user enumeration attacks
      return res.json({
        success: true,
        message: "If email exists in our records, a reset link has been printed to the backend console."
      });
    }

    const user = userRes.rows[0];
    const resetToken = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1-hour expiry

    // Save reset token
    await pool.query(
      "INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [resetToken, user.id, expiresAt]
    );

    // MOCK EMAIL SENDING: Output link directly to backend console log
    console.log("\n==================================================");
    console.log(`[MOCK EMAIL SERVICE] Password Reset Request for ${user.email}`);
    console.log("Click the link below in your browser to reset:");
    console.log(`http://localhost:5173/reset-password?token=${resetToken}`);
    console.log(`http://localhost:5174/reset-password?token=${resetToken}`);
    console.log("==================================================\n");

    res.json({
      success: true,
      message: "A password reset link has been printed to the backend server console."
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, error: "An error occurred." });
  }
});

// Reset Password
app.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: "Token and new password are required." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
  }

  try {
    const resetRes = await pool.query("SELECT * FROM password_resets WHERE token = $1", [token]);
    if (resetRes.rows.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid reset token." });
    }

    const resetRow = resetRes.rows[0];

    if (new Date() > new Date(resetRow.expires_at)) {
      await pool.query("DELETE FROM password_resets WHERE token = $1", [token]);
      return res.status(400).json({ success: false, error: "Reset token expired." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, resetRow.user_id]);

    // Clean up reset token
    await pool.query("DELETE FROM password_resets WHERE token = $1", [token]);

    // Log Activity
    await logActivity(resetRow.user_id, "Reset account password successfully");

    res.json({ success: true, message: "Password updated successfully. You can now log in." });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, error: "Failed to reset password." });
  }
});

// --- FILE ROUTING & QUOTAS ---

// List User Files
app.get("/files", authenticateToken, async (req, res) => {
  try {
    const dbRes = await pool.query(
      "SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    const dbFiles = dbRes.rows;

    const files = await Promise.all(dbFiles.map(async (file) => {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: file.storage_key
      });

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

// Secure File Upload with Disk Quota Audits
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

      // 1. Quota Check (Aggregate current used storage)
      const usageRes = await pool.query(
        "SELECT COALESCE(SUM(size), 0) AS total_used FROM files WHERE user_id = $1",
        [req.user.id]
      );
      const totalUsed = parseInt(usageRes.rows[0].total_used);

      const userRes = await pool.query(
        "SELECT quota_limit FROM users WHERE id = $1",
        [req.user.id]
      );
      const quotaLimit = parseInt(userRes.rows[0].quota_limit);

      if (totalUsed + file.size > quotaLimit) {
        return res.status(400).json({
          success: false,
          error: `Storage quota exceeded. Uploading this file (${(file.size / (1024 * 1024)).toFixed(1)}MB) would push you past your ${(quotaLimit / (1024 * 1024)).toFixed(0)}MB limit.`
        });
      }

      // 2. Upload file to S3
      const cleanName = sanitizeKey(file.originalname);
      const storageKey = `users/${req.user.id}/${cleanName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      );

      // 3. Save metadata
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

      // 4. Log Activity
      await logActivity(
        req.user.id,
        `Uploaded file: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`
      );

      // 5. Generate S3 presigned URL
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

    const filename = fileCheck.rows[0].filename;

    // 1. Delete from DigitalOcean Spaces
    const command = new DeleteObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key
    });
    await s3.send(command);

    // 2. Delete metadata from Database
    await pool.query("DELETE FROM files WHERE storage_key = $1 AND user_id = $2", [key, req.user.id]);

    // 3. Log Activity
    await logActivity(req.user.id, `Deleted file: ${filename}`);

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

// Secure Download Endpoint (Logs activity, then redirects)
app.get("/files/download/:key", authenticateToken, async (req, res) => {
  try {
    const key = req.params.key;
    
    const fileRes = await pool.query("SELECT * FROM files WHERE storage_key = $1 AND user_id = $2", [key, req.user.id]);
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "File not found or unauthorized." });
    }

    const file = fileRes.rows[0];

    // Log Activity
    await logActivity(req.user.id, `Downloaded file: ${file.filename}`);

    // Generate S3 presigned URL
    const getCommand = new GetObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key
    });
    const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

    res.json({
      success: true,
      downloadUrl
    });

  } catch (err) {
    console.error("Download endpoint error:", err);
    res.status(500).json({ success: false, error: "Failed to resolve secure download URL." });
  }
});

// --- ACTIVITIES ROUTING ---

// Fetch Activity Logs
app.get("/activities", authenticateToken, async (req, res) => {
  try {
    const dbRes = await pool.query(
      "SELECT action, created_at FROM activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json({
      success: true,
      activities: dbRes.rows
    });
  } catch (err) {
    console.error("Fetch activities error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve activity feed." });
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

// Start Server after Database migrations
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[CloudDrive Lite Secure API] Listening on port ${PORT}`);
    console.log(`[CORS] Whitelist Origin: ${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}`);
    console.log(`[Database] PostgreSQL database is connected and migrated.`);
  });
});
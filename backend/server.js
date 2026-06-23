require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// 1. Validate Environment Variables on Startup
const requiredEnv = [
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_KEY",
  "SPACES_SECRET"
];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error("FATAL ERROR: Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

// 2. Initialize S3 Client (DigitalOcean Spaces is S3 compatible)
const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

const app = express();

// 3. Security Middlewares
// Use helmet to secure HTTP headers
app.use(helmet());

// Configure CORS to allow the whitelisted origin and any local development ports dynamically
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin requests (origin is undefined)
    if (!origin) return callback(null, true);
    
    // Check if origin is localhost (any port) or whitelisted origin
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

// Apply Rate Limiter to prevent abuse (e.g., maximum 100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after 15 minutes."
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(apiLimiter);

// 4. File Upload Configuration (Multer with strict limits)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "26214400"); // Default 25MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1 // Only allow 1 file per upload request
  }
});

// Helper to sanitize filenames to prevent path traversal or special character issues in S3 keys
const sanitizeKey = (originalName) => {
  if (!originalName) return `${Date.now()}-unnamed`;
  // Extract filename only (strip directory structures if any)
  const baseName = originalName.replace(/^.*[\\\/]/, "");
  // Replace spaces and special characters with underscores
  const cleanName = baseName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  // Prepend timestamp for uniqueness
  return `${Date.now()}-${cleanName}`;
};

// 5. REST API Endpoints

// Root simple status route
app.get("/", (req, res) => {
  res.json({
    name: "CloudDrive Lite Secure Backend API",
    status: "online",
    storageType: "DigitalOcean Spaces"
  });
});

// List Files API with temporary Presigned Get URLs (secure, no public ACL required)
app.get("/files", async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.SPACES_BUCKET
    });

    const data = await s3.send(command);
    const contents = data.Contents || [];

    // Generate presigned download links for each file
    const files = await Promise.all(contents.map(async (file) => {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: file.Key
      });

      // Generate a presigned URL valid for 1 hour (3600 seconds)
      const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

      return {
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
        url: downloadUrl
      };
    }));

    // Sort files by last modified date desc
    files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      success: true,
      count: files.length,
      files
    });

  } catch (err) {
    console.error("List files error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve files from secure storage."
    });
  }
});

// Upload File API (Private storage, secure filenames, payload size validation)
app.post(
  "/upload",
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

      const key = sanitizeKey(file.originalname);

      // Upload file to Space WITHOUT "public-read" ACL so files remain private
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      );

      // Generate a temporary presigned URL for the uploaded file (valid for 1 hour)
      const getCommand = new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key
      });
      const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

      res.status(201).json({
        success: true,
        message: "File uploaded securely.",
        key,
        size: file.size,
        url: downloadUrl
      });

    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to upload file to secure storage."
      });
    }
  }
);

// Delete File API
app.delete("/files/:key", async (req, res) => {
  try {
    const key = req.params.key;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required."
      });
    }

    // Basic path traversal prevention (ensure file key doesn't contain path traversal characters)
    if (key.includes("..") || key.includes("/") || key.includes("\\")) {
      return res.status(400).json({
        success: false,
        error: "Invalid file key."
      });
    }

    const command = new DeleteObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key
    });

    await s3.send(command);

    res.json({
      success: true,
      message: "File deleted successfully from secure storage.",
      key
    });

  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete file from secure storage."
    });
  }
});

// 6. Global Error Handler Middleware (to hide stack traces)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    error: "An internal server error occurred."
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CloudDrive Lite Backend] Running securely on port ${PORT}`);
  console.log(`[CORS] Whitelisted Origin: ${allowedOrigin}`);
  console.log(`[Multer] Max File Size Limit: ${(maxFileSize / (1024 * 1024)).toFixed(1)}MB`);
});
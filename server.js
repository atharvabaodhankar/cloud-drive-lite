require("dotenv").config();

const express = require("express");
const multer = require("multer");

const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");

const app = express();

const upload = multer({
  storage: multer.memoryStorage()
});

const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

app.get("/", (req, res) => {
  res.send(`
    <h1>CloudDrive Lite 🚀</h1>

    <form
      action="/upload"
      method="POST"
      enctype="multipart/form-data"
    >
      <input type="file" name="file" />
      <button type="submit">
        Upload
      </button>
    </form>
  `);
});

app.post(
  "/upload",
  upload.single("file"),
  async (req, res) => {

    try {

      const file = req.file;

      const key =
        Date.now() + "-" + file.originalname;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: "public-read"
        })
      );

      const url =
        `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`;

      res.json({
        success: true,
        url
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: err.message
      });

    }

  }
);

app.listen(3000, () => {
  console.log("Server running");
});
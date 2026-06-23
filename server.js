require("dotenv").config();

const express = require("express");
const {
  S3Client,
  ListBucketsCommand
} = require("@aws-sdk/client-s3");

const app = express();

const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

app.get("/", async (req, res) => {
  try {
    const result = await s3.send(
      new ListBucketsCommand({})
    );

    res.json({
      message: "Spaces Connected 🚀",
      buckets: result.Buckets.map(b => b.Name)
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("Server running");
});
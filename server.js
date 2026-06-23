require("dotenv").config();

const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "CloudDrive Lite 🚀",
    bucket: process.env.SPACES_BUCKET,
    region: process.env.SPACES_REGION
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
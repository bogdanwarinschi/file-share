const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || "password";
const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function checkPassword(req, res, next) {
  const pw = req.query.pw || req.body?.pw || req.headers["x-password"];
  if (pw !== PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  next();
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the frontend
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// List files
app.get("/api/files", checkPassword, (_req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR).map((name) => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    return {
      name,
      size: stat.size,
      uploaded: stat.mtime.toISOString(),
    };
  });
  files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  res.json(files);
});

// Upload
app.post("/api/upload", checkPassword, upload.array("files", 20), (req, res) => {
  res.json({ uploaded: req.files.map((f) => f.filename) });
});

// Download
app.get("/api/download/:filename", checkPassword, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }
  res.download(filepath);
});

// Delete
app.delete("/api/files/:filename", checkPassword, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }
  fs.unlinkSync(filepath);
  res.json({ deleted: filename });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || "password";
const BUCKET = "files";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
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

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// List files
app.get("/api/files", checkPassword, async (_req, res) => {
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return res.status(500).json({ error: error.message });
  const files = data
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({
      name: f.name,
      size: f.metadata?.size || 0,
      uploaded: f.created_at,
    }));
  res.json(files);
});

// Upload
app.post("/api/upload", checkPassword, upload.array("files", 20), async (req, res) => {
  const uploaded = [];
  for (const file of req.files) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${base}-${unique}${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
    if (error) return res.status(500).json({ error: error.message });
    uploaded.push(filename);
  }
  res.json({ uploaded });
});

// Download
app.get("/api/download/:filename", checkPassword, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const { data, error } = await supabase.storage.from(BUCKET).download(filename);
  if (error) return res.status(404).json({ error: "File not found" });
  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  };
  res.set("Content-Type", mimeTypes[ext] || "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

// Delete
app.delete("/api/files/:filename", checkPassword, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const { error } = await supabase.storage.from(BUCKET).remove([filename]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: filename });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

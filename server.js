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

// List files — returns signed URLs for direct browser access
app.get("/api/files", checkPassword, async (_req, res) => {
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return res.status(500).json({ error: error.message });

  const names = data
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => f.name);

  let urls = {};
  if (names.length) {
    const { data: signed, error: urlErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(names, 3600);
    if (!urlErr && signed) {
      for (const s of signed) {
        if (s.signedUrl) urls[s.path] = s.signedUrl;
      }
    }
  }

  const files = data
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({
      name: f.name,
      size: f.metadata?.size || 0,
      uploaded: f.created_at,
      url: urls[f.name] || null,
    }));
  res.json(files);
});

// Upload — goes through server to avoid CORS issues
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

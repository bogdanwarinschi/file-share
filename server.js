require("dotenv").config();
const express = require("express");
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

// List files — returns name, size, uploaded, and a signed URL for each
app.get("/api/files", checkPassword, async (_req, res) => {
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return res.status(500).json({ error: error.message });

  const names = data
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => f.name);

  // Create signed URLs in bulk (valid 1 hour)
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

// Get a signed upload URL — browser uploads directly to Supabase
app.post("/api/upload-url", checkPassword, async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "filename required" });

  const ext = path.extname(filename);
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
  const storageName = `${base}-${unique}${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storageName);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ signedUrl: data.signedUrl, token: data.token, path: storageName });
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

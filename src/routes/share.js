// src/routes/share.js
const express = require("express");
const prisma = require("../db/prisma");
const ensureAuth = require("../middleware/ensureAuth");
const { customAlphabet } = require("nanoid");

const router = express.Router();
const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 22);

function parseDuration(s) {
  const m = String(s || "").trim().match(/^(\d+)\s*([dh])$/i);
  if (!m) return 24 * 3600 * 1000; // default 1d
  const n = parseInt(m[1], 10);
  return n * (m[2].toLowerCase() === "h" ? 3600e3 : 86400e3);
}

// Create share link (owner only)
router.post("/share", ensureAuth, async (req, res) => {
  const { type, id, duration } = req.body;
  const token = nanoid();
  const expiresAt = new Date(Date.now() + parseDuration(duration));

  try {
    if (type === "file") {
      const file = await prisma.file.findFirst({ where: { id: Number(id), userId: req.user.id } });
      if (!file) return res.sendStatus(404);
      await prisma.shareLink.create({ data: { token, fileId: file.id, expiresAt } });
    } else if (type === "folder") {
      const folder = await prisma.folder.findFirst({ where: { id: Number(id), userId: req.user.id } });
      if (!folder) return res.sendStatus(404);
      await prisma.shareLink.create({ data: { token, folderId: folder.id, expiresAt } });
    } else {
      return res.status(400).send("Invalid type");
    }
    res.redirect(`/s/${token}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Could not create link");
  }
});

// Public view: file OR folder
router.get("/s/:token", async (req, res) => {
  const link = await prisma.shareLink.findUnique({
    where: { token: req.params.token },
    include: { file: true, folder: { include: { files: true, children: true } } },
  });
  if (!link || link.expiresAt < new Date()) return res.status(404).send("Link expired or not found.");

  if (link.file) return res.render("share/file", { token: req.params.token, file: link.file });
  if (link.folder) return res.render("share/folder", { folder: link.folder, token: req.params.token });
  return res.status(404).send("Invalid link.");
});

// Public download (works for Cloudinary or local)
router.get("/s/:token/download", async (req, res) => {
  const link = await prisma.shareLink.findUnique({
    where: { token: req.params.token },
    include: { file: true },
  });
  if (!link || link.expiresAt < new Date() || !link.file) return res.status(404).send("Not found.");

  const file = link.file;
  if (file.url) return res.redirect(file.url);      // Cloudinary
  return res.download(file.path, file.originalName); // Local disk
});

module.exports = router;

// src/routes/files.js
const express = require("express");
const multer = require("multer");
const prisma = require("../db/prisma");
const ensureAuth = require("../middleware/ensureAuth");

// NEW: cloudinary
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = express.Router();
router.use(ensureAuth);

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload form
router.get("/upload", async (req, res) => {
  const folders = await prisma.folder.findMany({ where: { userId: req.user.id } });
  res.render("files/upload", { error: null, folders });
});

// Handle upload -> Cloudinary
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      const folders = await prisma.folder.findMany({ where: { userId: req.user.id } });
      return res.status(400).render("files/upload", { error: "Please choose a file.", folders });
    }

    const folderId = req.body.folderId ? Number(req.body.folderId) : null;

    // Send buffer to Cloudinary
    const options = {
      folder: process.env.CLOUDINARY_FOLDER || "file_uploader",
      resource_type: "auto", // Cloudinary picks image / raw / video
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`, // optional custom id
      use_filename: false,
    };

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      stream.end(req.file.buffer);
    });

    const saved = await prisma.file.create({
      data: {
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        // cloud fields
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        resourceType: uploadResult.resource_type,
        // locals not used
        filename: null,
        path: null,
        userId: req.user.id,
        folderId,
      },
    });

    res.redirect(`/files/${saved.id}`);
  } catch (err) {
    console.error(err);
    const folders = await prisma.folder.findMany({ where: { userId: req.user.id } });
    res.status(500).render("files/upload", { error: "Upload failed. Try again.", folders });
  }
});

// File details
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const file = await prisma.file.findFirst({
    where: { id, userId: req.user.id },
    include: { folder: true },
  });
  if (!file) return res.sendStatus(404);
  res.render("files/show", { file });
});

// "Download": redirect to Cloudinary URL (simplest)
router.get("/:id/download", async (req, res) => {
  const id = Number(req.params.id);
  const file = await prisma.file.findFirst({ where: { id, userId: req.user.id } });
  if (!file || !file.url) return res.sendStatus(404);
  // If you want forced download, add fl_attachment transformation:
  // const dlUrl = cloudinary.url(file.publicId, { resource_type: file.resourceType || "raw", flags: "attachment" });
  return res.redirect(file.url);
});

// (Optional) Delete: remove from Cloudinary too
router.post("/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  const file = await prisma.file.findFirst({ where: { id, userId: req.user.id } });
  if (!file) return res.sendStatus(404);

  try {
    if (file.publicId) {
      await cloudinary.uploader.destroy(file.publicId, {
        resource_type: file.resourceType || "raw",
      });
    }
    await prisma.file.delete({ where: { id } });
  } catch (e) {
    console.error(e);
  }
  res.redirect("/");
});

module.exports = router;

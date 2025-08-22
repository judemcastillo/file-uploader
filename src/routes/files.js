// src/routes/files.js
const express = require("express");
const multer = require("multer");
const prisma = require("../db/prisma");
const ensureAuth = require("../middleware/ensureAuth");
const { body, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");

// cloudinary
const cloudinary = require("cloudinary").v2;
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = express.Router();

router.get("/", async (req, res) => {
	const files = await prisma.file.findMany({
		where: { userId: req.user.id },
		orderBy: { createdAt: "desc" },
		include: { folder: true },
		take: 100, // adjust as you like
	});
	res.render("files/index", { files });
});

router.use(ensureAuth);

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload form
router.get("/upload", async (req, res) => {
	const folders = await prisma.folder.findMany({
		where: { userId: req.user.id },
	});
	res.render("files/upload", {
		error: null,
		folders,
		defaultFolderId: Number(req.query.folderId) || null,
	});
});

// Handle upload -> Cloudinary
router.post("/upload", upload.single("file"), async (req, res) => {
	try {
		if (!req.file) {
			const folders = await prisma.folder.findMany({
				where: { userId: req.user.id },
			});
			return res
				.status(400)
				.render("files/upload", { error: "Please choose a file.", folders });
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
			const stream = cloudinary.uploader.upload_stream(
				options,
				(err, result) => {
					if (err) return reject(err);
					resolve(result);
				}
			);
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
		const folders = await prisma.folder.findMany({
			where: { userId: req.user.id },
		});
		res
			.status(500)
			.render("files/upload", { error: "Upload failed. Try again.", folders });
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
	const file = await prisma.file.findFirst({
		where: { id, userId: req.user.id },
	});
	if (!file || !file.url) return res.sendStatus(404);
	// If you want forced download, add fl_attachment transformation:
	// const dlUrl = cloudinary.url(file.publicId, { resource_type: file.resourceType || "raw", flags: "attachment" });
	return res.redirect(file.url);
});

// (Optional) Delete: remove from Cloudinary too
router.post("/:id/delete", async (req, res) => {
	const id = Number(req.params.id);
	const file = await prisma.file.findFirst({
		where: { id, userId: req.user.id },
	});
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

// POST /files/:id/rename
router.post(
	"/:id/rename",
	[
		body("newName")
			.trim()
			.isLength({ min: 1, max: 255 })
			.withMessage("Name is required")
			.custom((v) => !/[\\/]/.test(v))
			.withMessage("Name cannot contain slashes"),
	],
	async (req, res) => {
		const id = Number(req.params.id);
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			// simple bounce-back; you can render with errors if you prefer
			return res.status(400).send(errors.array()[0].msg);
		}

		const file = await prisma.file.findFirst({
			where: { id, userId: req.user.id },
		});
		if (!file) return res.sendStatus(404);

		// Keep the same extension
		const ext = path.extname(file.originalName || "");
		const base = req.body.newName.replace(/[\\/]/g, "");
		const finalOriginalName = base.endsWith(ext) ? base : base + ext;

		try {
			if (file.publicId) {
				// Cloudinary: also rename the asset (so URL/publicId changes)
				const cloudinary = require("cloudinary").v2;
				const folderPart = file.publicId.includes("/")
					? file.publicId.split("/").slice(0, -1).join("/")
					: "";
				const newPublicBase = path.parse(finalOriginalName).name; // name without extension
				const newPublicId = folderPart
					? `${folderPart}/${newPublicBase}`
					: newPublicBase;

				const result = await cloudinary.uploader.rename(
					file.publicId,
					newPublicId,
					{ resource_type: file.resourceType || "auto", overwrite: true }
				);

				await prisma.file.update({
					where: { id },
					data: {
						originalName: finalOriginalName,
						publicId: result.public_id,
						url: result.secure_url,
					},
				});
			} else {
				// Local: we usually store a random disk filename, so renaming display name is enough.
				// If you *want* to rename the physical file too, uncomment below:
				// const newDiskName = file.filename; // keep same random name, or compute from new name
				// fs.renameSync(file.path, path.join(path.dirname(file.path), newDiskName));
				await prisma.file.update({
					where: { id },
					data: { originalName: finalOriginalName },
				});
			}

			res.redirect(`/files/${id}`);
		} catch (e) {
			console.error(e);
			res.status(500).send("Rename failed.");
		}
	}
);

module.exports = router;

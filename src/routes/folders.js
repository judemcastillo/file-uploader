// src/routes/folders.js
const express = require("express");
const prisma = require("../db/prisma");
const ensureAuth = require("../middleware/ensureAuth");
const { body, validationResult } = require("express-validator");
const { buildBreadcrumbs } = require("../utils/breadcrumbs");

const router = express.Router();
router.use(ensureAuth);

// Create folder (root or inside a parent)
router.post(
	"/",
	[
		body("name")
			.trim()
			.isLength({ min: 1 })
			.withMessage("Folder name is required"),
	],
	async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			// bounce back to previous page
			req.session.createFolderError = errors.array()[0].msg;
			return res.redirect("back");
		}
		const { name, parentId } = req.body;
		await prisma.folder.create({
			data: {
				name,
				userId: req.user.id,
				parentId: parentId ? Number(parentId) : null,
			},
		});
		res.redirect(parentId ? `/folders/${parentId}` : "/");
	}
);

// Show a folder (children + files) WITH breadcrumbs
router.get("/:id", async (req, res) => {
	const id = Number(req.params.id);
	const folder = await prisma.folder.findFirst({
		where: { id, userId: req.user.id },
		include: { parent: true, children: true, files: true },
	});
	if (!folder) return res.sendStatus(404);

	const breadcrumbs = await buildBreadcrumbs(id, req.user.id);

	res.render("folders/show", {
		folder,
		breadcrumbs,
		error: req.session.createFolderError || null,
	});
	req.session.createFolderError = null;
});

// Rename
router.post(
	"/:id/rename",
	[body("name").trim().notEmpty()],
	async (req, res) => {
		const id = Number(req.params.id);
		await prisma.folder.update({
			where: { id },
			data: { name: req.body.name },
		});
		res.redirect(`/folders/${id}`);
	}
);

// Delete
router.post("/:id/delete", async (req, res) => {
	const id = Number(req.params.id);
	await prisma.folder.delete({ where: { id } }); // cascades per schema
	res.redirect("/");
});

module.exports = router;

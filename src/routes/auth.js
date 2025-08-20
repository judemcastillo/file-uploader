const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const prisma = require("../db/prisma");
const { body, validationResult } = require("express-validator");

const router = express.Router();

router.get("/register", (req, res) => {
	res.render("auth/register", { errors: null, values: {} });
});

router.post(
	"/register",
	[
		body("email")
			.trim()
			.isEmail()
			.withMessage("Enter valid email address")
			.normalizeEmail()
			.bail(),
		body("password")
			.isLength({ min: 8, max: 72 })
			.withMessage("Password must be 8–72 characters long")
			.matches(/[A-Z]/)
			.withMessage("Password must include at least one uppercase letter")
			.matches(/\d/)
			.withMessage("Password must include at least one number")
			.matches(/[^A-Za-z0-9]/)
			.withMessage("Password must include at least one special character")
			.not()
			.matches(/\s/)
			.withMessage("Password must not contain spaces.")
			.bail(),

		body("confirmPassword").custom((value, { req }) => {
			if (value !== req.body.password)
				throw new Error("Passwords do not match");
			return true;
		}),
	],
	async (req, res) => {
		const result = validationResult(req);
		if (!result.isEmpty()) {
			return res.status(400).render("auth/register", {
				errors: result.array().map((e) => e.msg),
				values: { email: req.body.email || "" },
			});
		}
		const { email, password } = req.body;

		try {
			const existing = await prisma.user.findUnique({ where: { email } });
			if (existing) {
				return res.status(400).render("auth/register", {
					errors: "Email already in use.",
					values: { email },
				});
			}
			const passwordHash = await bcrypt.hash(password, 10);
			await prisma.user.create({ data: { email, passwordHash } });
			res.redirect("/login");
		} catch (err) {
			console.error(err);
			res.status(500).render("auth/register", {
				errors: "Something went wrong.",
				values: { email: req.body.email || "" },
			});
		}
	}
);

router.get("/login", (req, res) => {
	res.render("auth/login", { error: null });
});

router.post(
	"/login",
	passport.authenticate("local", {
		successRedirect: "/",
		failureRedirect: "/login",
	})
);

router.post("/logout", (req, res, next) => {
	req.logout((err) => {
		if (err) return next(err);
		res.redirect("/");
	});
});

module.exports = router;

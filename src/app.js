// src/app.js
const express = require("express");
const path = require("path");
require("dotenv").config();

const session = require("express-session");
const passport = require("passport");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const prisma = require("./db/prisma");
const configurePassport = require("./config/passport-config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// middleware
app.use("/static", express.static(path.join(__dirname, "..", "public")));
app.use(
	session({
		secret: process.env.SESSION_SECRET || "change_me",
		resave: false,
		saveUninitialized: false,
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
		store: new PrismaSessionStore(prisma, {
			checkPeriod: 2 * 60 * 1000,
			dbRecordIdIsSessionId: false,
		}),
	})
);

// Initialize Passport
configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// currentUser for views
app.use((req, res, next) => {
	res.locals.currentUser = req.user || null;
	next();
});

// mount routes
app.use("/", require("./routes/auth"));
app.use("/files", require("./routes/files"));
app.use("/folders", require("./routes/folders"));
app.use("/", require("./routes/share"));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
	if (!req.user) return res.render("home", { title: "File Uploader" });

	const [rootFolders, rootFiles] = await Promise.all([
		prisma.folder.findMany({
			where: { userId: req.user.id, parentId: null },
			orderBy: { updatedAt: "desc" },
		}),
		prisma.file.findMany({
			where: { userId: req.user.id, folderId: null }, // <- files at the root
			orderBy: { createdAt: "desc" },
		}),
	]);

	res.render("dashboard", {
		rootFolders,
		rootFiles,
		error: req.session.createFolderError || null,
	});
	req.session.createFolderError = null;
});

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});

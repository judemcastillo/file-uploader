// src/config/passport-config.js
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const prisma = require("../db/prisma");

module.exports = function configurePassport(passport) {
	// Local strategy (email + password)
	passport.use(
		new LocalStrategy(
			{ usernameField: "email", passwordField: "password" },
			async (email, password, done) => {
				try {
					const user = await prisma.user.findUnique({ where: { email } });
					if (!user)
						return done(null, false, { message: "Invalid email or password" });

					const ok = await bcrypt.compare(password, user.passwordHash);
					if (!ok)
						return done(null, false, { message: "Invalid email or password" });

					return done(null, user);
				} catch (err) {
					return done(err);
				}
			}
		)
	);

	// Session serialization
	passport.serializeUser((user, done) => done(null, user.id));

	passport.deserializeUser(async (id, done) => {
		try {
			const user = await prisma.user.findUnique({ where: { id } });
			done(null, user);
		} catch (err) {
			done(err);
		}
	});
};

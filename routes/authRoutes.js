const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const allowedRoles = ["STUDENT", "MODERATOR", "ADMIN"];

const getSessionCookieName = () => process.env.SESSION_COOKIE_NAME || "studystudent_session";
const getJwtSecret = () => process.env.JWT_SECRET || "dev-secret";

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: Boolean(user.emailVerified),
  authProvider: user.authProvider,
  profile: {
    bio: user.profile?.bio || "",
    avatarUrl: user.profile?.avatarUrl || "",
    phone: user.profile?.phone || "",
  },
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const issueToken = (user) => jwt.sign({
  id: user._id.toString(),
  email: user.email,
  role: user.role,
}, getJwtSecret(), { expiresIn: "7d" });

const setSessionCookie = (res, token) => {
  res.cookie(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters long." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ message: "An account already exists for this email." });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: passwordHash,
    role: "STUDENT",
    emailVerified: false,
    emailVerificationToken: verificationToken,
    authProvider: "email",
  });

  const token = issueToken(user);
  setSessionCookie(res, token);

  return res.status(201).json({
    token,
    verificationToken,
    user: serializeUser(user),
    message: "Registration successful. Verify your email before accessing restricted workflows.",
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const isValid = await bcrypt.compare(String(password), user.password || "");
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = issueToken(user);
  setSessionCookie(res, token);

  return res.json({
    token,
    user: serializeUser(user),
    message: user.emailVerified ? "Login successful." : "Login successful. Please verify your email.",
  });
});

router.post("/google", async (req, res) => {
  const { name, email, avatarUrl } = req.body || {};

  if (!email) {
    return res.status(400).json({ message: "Google email is required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    user = await User.create({
      name: String(name || "Google User").trim(),
      email: normalizedEmail,
      password: crypto.randomBytes(18).toString("hex"),
      role: "STUDENT",
      authProvider: "google",
      emailVerified: true,
      profile: {
        avatarUrl: avatarUrl || "",
      },
    });
  } else {
    user.name = String(name || user.name || "Google User").trim();
    user.authProvider = "google";
    user.emailVerified = true;
    if (avatarUrl) user.profile = { ...user.profile.toObject?.() || user.profile, avatarUrl };
    await user.save();
  }

  const token = issueToken(user);
  setSessionCookie(res, token);

  return res.json({ token, user: serializeUser(user), message: "Google sign-in successful." });
});

router.post("/logout", requireAuth, (req, res) => {
  res.clearCookie(getSessionCookieName(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res.json({ message: "Logged out successfully." });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  return res.json({ user: serializeUser(user) });
});

router.put("/profile", requireAuth, async (req, res) => {
  const { name, bio, avatarUrl, phone } = req.body || {};
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  if (typeof name === "string" && name.trim()) user.name = name.trim();
  if (typeof bio === "string") user.profile = { ...user.profile, bio: bio.trim() };
  if (typeof avatarUrl === "string") user.profile = { ...user.profile, avatarUrl: avatarUrl.trim() };
  if (typeof phone === "string") user.profile = { ...user.profile, phone: phone.trim() };

  await user.save();
  return res.json({ user: serializeUser(user), message: "Profile updated successfully." });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password are required." });
  }

  const match = await bcrypt.compare(String(currentPassword), user.password || "");
  if (!match) {
    return res.status(401).json({ message: "Current password is incorrect." });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters long." });
  }

  user.password = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  return res.json({ message: "Password updated successfully." });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: "Email is required." });

  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) {
    return res.json({ message: "If an account exists, a reset link has been generated." });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = resetToken;
  user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  return res.json({
    message: "If an account exists, a reset link has been generated.",
    resetToken: process.env.NODE_ENV === "test" ? resetToken : undefined,
  });
});

router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Reset token and new password are required." });
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired reset token." });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters long." });
  }

  user.password = await bcrypt.hash(String(newPassword), 10);
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  return res.json({ message: "Password reset successful." });
});

router.post("/verify-email", async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Verification token is required." });
  }

  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) {
    return res.status(400).json({ message: "Invalid or expired verification token." });
  }

  user.emailVerified = true;
  user.emailVerificationToken = null;
  await user.save();

  return res.json({ message: "Email verified successfully.", user: serializeUser(user) });
});

router.patch("/users/:id/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Role must be one of STUDENT, MODERATOR, or ADMIN." });
  }

  if (String(req.user.id) === String(id)) {
    return res.status(403).json({ message: "You cannot change your own role through this endpoint." });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  user.role = role;
  await user.save();

  return res.json({ message: "User role updated successfully.", user: serializeUser(user) });
});

module.exports = router;

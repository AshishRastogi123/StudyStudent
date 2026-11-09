const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const googleOAuthClient = new OAuth2Client();
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
  isActive: user.isActive !== false,
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
  if (!user || user.isActive === false) {
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

router.get("/google/config", (req, res) => {
  return res.json({ clientId: process.env.GOOGLE_CLIENT_ID || "" });
});

router.post("/google", async (req, res) => {
  const { credential } = req.body || {};

  if (typeof credential !== "string" || !credential.trim() || credential.length > 8192) {
    return res.status(400).json({ message: "A valid Google credential is required." });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ message: "Google sign-in is not configured." });
  }

  let payload;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: "Google credential is invalid or expired." });
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return res.status(401).json({ message: "Google must provide a verified email address." });
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });

  if (user?.isActive === false) {
    return res.status(403).json({ message: "This account is disabled." });
  }

  if (!user) {
    const name = typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : normalizedEmail.split("@")[0];
    user = await User.create({
      name,
      email: normalizedEmail,
      password: crypto.randomBytes(18).toString("hex"),
      role: "STUDENT",
      authProvider: "google",
      emailVerified: true,
      profile: {
        avatarUrl: payload.picture || "",
      },
    });
  } else {
    user.authProvider = "google";
    user.emailVerified = true;
  }

  user.lastLoginAt = new Date();
  await user.save();

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

router.get("/users", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { q, role, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (role) {
      const normalizedRole = String(role).toUpperCase();
      if (!allowedRoles.includes(normalizedRole)) {
        return res.status(400).json({ message: "Role filter is invalid." });
      }
      query.role = normalizedRole;
    }

    if (status && !["active", "inactive", "all"].includes(String(status))) {
      return res.status(400).json({ message: "Account status filter is invalid." });
    }

    if (status === "active") query.isActive = { $ne: false };
    if (status === "inactive") query.isActive = false;

    if (q && String(q).trim()) {
      const searchTerm = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -emailVerificationToken -passwordResetToken -passwordResetExpiresAt")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      users: users.map((user) => serializeUser(user)),
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Admin user listing failed:", error);
    return res.status(500).json({ message: "Unable to fetch users." });
  }
});

router.patch("/users/:id/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
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

    if (user.isActive !== false && user.role === "ADMIN" && role !== "ADMIN") {
      const activeAdmins = await User.countDocuments({ role: "ADMIN", isActive: { $ne: false } });
      if (activeAdmins <= 1) {
        return res.status(409).json({ message: "The last active administrator cannot be demoted." });
      }
    }

    user.role = role;
    await user.save();

    return res.json({ message: "User role updated successfully.", user: serializeUser(user) });
  } catch (error) {
    console.error("Admin role update failed:", error);
    return res.status(500).json({ message: "Unable to update user role." });
  }
});

router.patch("/users/:id/status", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean." });
    }

    if (String(req.user.id) === String(id)) {
      return res.status(403).json({ message: "You cannot deactivate your own account." });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!isActive && user.isActive !== false && user.role === "ADMIN") {
      const activeAdmins = await User.countDocuments({ role: "ADMIN", isActive: { $ne: false } });
      if (activeAdmins <= 1) {
        return res.status(409).json({ message: "The last active administrator cannot be deactivated." });
      }
    }

    user.isActive = isActive;
    await user.save();

    return res.json({
      message: `User ${isActive ? "activated" : "deactivated"} successfully.`,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Admin user status update failed:", error);
    return res.status(500).json({ message: "Unable to update user status." });
  }
});

module.exports = router;

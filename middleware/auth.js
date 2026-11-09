const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const normalizeRole = (role) => String(role || "").trim().toUpperCase();

const requireAuth = async (req, res, next) => {
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token || null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  if (!mongoose.isValidObjectId(decoded.id)) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  try {
    const user = await User.findById(decoded.id).select("role isActive").lean();
    if (!user || user.isActive === false) {
      return res.status(401).json({ message: "This account is inactive or no longer exists." });
    }

    req.user = { ...decoded, role: user.role };
    return next();
  } catch (error) {
    console.error("Authentication user lookup failed:", error);
    return res.status(500).json({ message: "Unable to verify your account." });
  }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
  const hasAccess = userRoles.some((role) => normalizedAllowedRoles.includes(normalizeRole(role)));

  if (!hasAccess) {
    return res.status(403).json({ message: "You do not have permission to perform this action." });
  }

  return next();
};

module.exports = {
  normalizeRole,
  requireAuth,
  requireRole,
};

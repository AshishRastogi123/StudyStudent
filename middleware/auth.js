const jwt = require("jsonwebtoken");

const normalizeRole = (role) => String(role || "").trim().toUpperCase();

const requireAuth = (req, res, next) => {
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token || null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
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

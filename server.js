const { validateAppConfig } = require("./config/env");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { requireAuth, requireRole } = require("./middleware/auth");
const authRoutes = require("./routes/authRoutes");
const academicRoutes = require("./routes/academicRoutes");
const notesRoutes = require("./routes/notesRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
const config = validateAppConfig();
const port = config.port;

const allowedOrigins = [...new Set([...(config.allowedOrigins || []), config.frontendUrl, "http://localhost:3000", "http://127.0.0.1:3000"])];

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please wait before trying again." },
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS policy"));
  },
  credentials: true,
}));
app.use(generalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api/auth", authLimiter);

app.get("/api/health", async (req, res) => {
  const dbConnected = require("mongoose").connection.readyState === 1;
  res.json({
    status: dbConnected ? "ok" : "degraded",
    service: "StudyStudent",
    database: dbConnected ? "connected" : "disconnected",
    environment: config.nodeEnv,
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/profile", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

app.get("/api/admin/check", requireAuth, requireRole("ADMIN"), (req, res) => {
  res.json({ message: "Admin access granted." });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Uploaded file is too large."
      : err.message || "Invalid uploaded file.";
    return res.status(400).json({ message });
  }

  if (err && err.message === "Origin not allowed by CORS policy") {
    return res.status(403).json({ message: "Origin not allowed by CORS policy." });
  }

  if (err) {
    console.error("Unhandled server error:", err);
    return res.status(500).json({ message: err.message || "Internal server error." });
  }
  return next();
});

const startServer = async () => {
  await connectDB();
  app.listen(port, () => {
    console.log(`StudyStudent server listening on port ${port}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start StudyStudent server:", error);
    process.exit(1);
  });
}

module.exports = app;

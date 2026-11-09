const { validateAppConfig } = require("./config/env");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { requireAuth, requireRole } = require("./middleware/auth");
const authRoutes = require("./routes/authRoutes");
const academicRoutes = require("./routes/academicRoutes");
const notesRoutes = require("./routes/notesRoutes");

const app = express();
const config = validateAppConfig();
const port = config.port;

app.use(morgan("dev"));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "StudyStudent", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/notes", notesRoutes);

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
  if (err) {
    console.error("Unhandled server error:", err);
    return res.status(500).json({ message: "Internal server error." });
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

const fs = require("fs");
const path = require("path");

const exampleEnvPath = path.join(__dirname, "..", ".env.example");
const localEnvPath = path.join(__dirname, "..", ".env");

const requiredEnv = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",
  "SESSION_COOKIE_NAME",
  "NODE_ENV",
];

function loadEnvFile() {
  if (fs.existsSync(localEnvPath)) {
    require("dotenv").config({ path: localEnvPath });
    return;
  }

  if (fs.existsSync(exampleEnvPath)) {
    require("dotenv").config({ path: exampleEnvPath });
  }
}

loadEnvFile();

function isMissing(value) {
  return typeof value !== "string" || value.trim() === "" || value === "replace-with-a-long-random-secret";
}

function collectMissingEnv() {
  return requiredEnv.filter((key) => isMissing(process.env[key]));
}

function validateAppConfig() {
  const missing = collectMissingEnv();

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and complete the values.`);
  }

  return {
    port: Number(process.env.PORT || 3000),
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    nodeEnv: process.env.NODE_ENV || "development",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  };
}

module.exports = {
  requiredEnv,
  collectMissingEnv,
  validateAppConfig,
  loadEnvFile,
};

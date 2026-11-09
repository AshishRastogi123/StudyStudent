const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../server");
const connectDB = require("../config/db");

let mongoServer;
let httpServer;
let baseUrl;

test.before(async () => {
  process.env.JWT_SECRET = "phase-8-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase8");
  await connectDB();

  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (httpServer) {
    await new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) await mongoServer.stop();
});

test("health endpoint reports a healthy service and security headers are present", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.service, "StudyStudent");
  assert.equal(body.status === "ok" || body.status === "degraded", true);

  const headerValue = response.headers.get("x-powered-by");
  assert.equal(headerValue, null);

  const xFrameOptions = response.headers.get("x-frame-options");
  assert.equal(xFrameOptions !== null, true);

  const contentSecurityPolicy = response.headers.get("content-security-policy");
  assert.match(contentSecurityPolicy, /script-src[^;]*accounts\.google\.com\/gsi\/client/);
  assert.match(contentSecurityPolicy, /frame-src[^;]*accounts\.google\.com\/gsi\//);
});

test("rate limiting is enabled on auth routes", async () => {
  const requests = Array.from({ length: 30 }, () => fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "bad@example.com", password: "wrong" }),
  }));

  const responses = await Promise.all(requests);
  const throttled = responses.some((response) => response.status === 429);
  assert.equal(throttled, true);
});

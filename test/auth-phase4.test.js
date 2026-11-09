const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../server");
const connectDB = require("../config/db");
const User = require("../models/User");

let mongoServer;
let httpServer;
let baseUrl;

const makeToken = (user) => jwt.sign({ id: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" });

const resetDb = async () => {
  await User.deleteMany({});
};

test.before(async () => {
  process.env.JWT_SECRET = "phase-4-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase4");
  await connectDB();

  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (httpServer) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) await mongoServer.stop();
});

test.beforeEach(async () => {
  await resetDb();
});

test("register, verify email, update profile, and login successfully", async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice Student", email: "alice@example.com", password: "StrongPass123" }),
  });

  assert.equal(registerResponse.status, 201);
  const registerBody = await registerResponse.json();
  assert.equal(registerBody.user.role, "STUDENT");
  assert.ok(registerBody.verificationToken);

  const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registerBody.verificationToken }),
  });

  assert.equal(verifyResponse.status, 200);
  const verifiedBody = await verifyResponse.json();
  assert.equal(verifiedBody.user.emailVerified, true);

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${registerBody.token}` },
  });
  assert.equal(meResponse.status, 200);
  const meBody = await meResponse.json();
  assert.equal(meBody.user.email, "alice@example.com");

  const profileResponse = await fetch(`${baseUrl}/api/auth/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${registerBody.token}`,
    },
    body: JSON.stringify({ bio: "Computer science learner", avatarUrl: "https://example.com/avatar.png", phone: "+91-9999999999" }),
  });

  assert.equal(profileResponse.status, 200);
  const profileBody = await profileResponse.json();
  assert.equal(profileBody.user.profile.bio, "Computer science learner");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", password: "StrongPass123" }),
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.user.email, "alice@example.com");
});

test("admin can update roles and students cannot change their own role", async () => {
  const adminUser = await User.create({ name: "Admin One", email: "admin@example.com", password: "hashed-pass", role: "ADMIN", emailVerified: true });
  const studentUser = await User.create({ name: "Student One", email: "student@example.com", password: "hashed-pass", role: "STUDENT", emailVerified: true });

  const adminToken = makeToken(adminUser);
  const studentToken = makeToken(studentUser);

  const promoteResponse = await fetch(`${baseUrl}/api/auth/users/${studentUser._id}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ role: "MODERATOR" }),
  });

  assert.equal(promoteResponse.status, 200);
  const promoteBody = await promoteResponse.json();
  assert.equal(promoteBody.user.role, "MODERATOR");

  const selfChangeResponse = await fetch(`${baseUrl}/api/auth/users/${adminUser._id}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({ role: "ADMIN" }),
  });

  assert.equal(selfChangeResponse.status, 403);
  assert.equal((await selfChangeResponse.json()).message, "You do not have permission to perform this action.");
});

test("password reset flow works for valid users", async () => {
  const user = await User.create({
    name: "Reset User",
    email: "reset@example.com",
    password: "hashed-pass",
    role: "STUDENT",
    emailVerified: true,
  });

  const forgotResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email }),
  });

  assert.equal(forgotResponse.status, 200);
  const forgotBody = await forgotResponse.json();
  assert.ok(forgotBody.resetToken);

  const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: forgotBody.resetToken, newPassword: "NewPassword123" }),
  });

  assert.equal(resetResponse.status, 200);
  const resetBody = await resetResponse.json();
  assert.equal(resetBody.message, "Password reset successful.");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "NewPassword123" }),
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.user.email, user.email);
});

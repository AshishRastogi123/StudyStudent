const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../server");
const connectDB = require("../config/db");
const User = require("../models/User");
const Course = require("../models/Course");
const Subject = require("../models/Subject");
const Note = require("../models/Note");
const Notification = require("../models/Notification");

let mongoServer;
let httpServer;
let baseUrl;

const makeToken = (user) => jwt.sign({ id: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" });

const resetDb = async () => {
  await Promise.all([
    User.deleteMany({}),
    Course.deleteMany({}),
    Subject.deleteMany({}),
    Note.deleteMany({}),
    Notification.deleteMany({}),
  ]);
};

test.before(async () => {
  process.env.JWT_SECRET = "phase-7-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase7");
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

test.beforeEach(async () => {
  await resetDb();
});

test("students receive note status notifications and can manage them", async () => {
  const student = await User.create({ name: "Student Alpha", email: "student-alpha@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const course = await Course.create({ name: "Biology", slug: "biology", description: "Life sciences" });
  const subject = await Subject.create({ courseId: course._id, name: "Genetics", code: "BIO201", semester: 2 });

  const uploadResponse = await fetch(`${baseUrl}/api/notes/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({
      courseId: course._id,
      subjectId: subject._id,
      title: "Genetics Cheat Sheet",
      description: "Summary of Mendelian genetics.",
      fileName: "genetics.pdf",
      storagePath: "uploads/genetics.pdf",
      fileSize: 900,
      mimeType: "application/pdf",
      checksum: "phase7-checksum-1",
    }),
  });

  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();
  assert.equal(uploadBody.note.status, "pending");

  const notificationsResponse = await fetch(`${baseUrl}/api/notifications/`, {
    headers: { Authorization: `Bearer ${makeToken(student)}` },
  });

  assert.equal(notificationsResponse.status, 200);
  const notificationsBody = await notificationsResponse.json();
  assert.equal(Array.isArray(notificationsBody.notifications), true);
  assert.equal(notificationsBody.unreadCount >= 1, true);

  const markAllReadResponse = await fetch(`${baseUrl}/api/notifications/mark-all-read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${makeToken(student)}` },
  });

  assert.equal(markAllReadResponse.status, 200);

  const unsubscribeResponse = await fetch(`${baseUrl}/api/notifications/?unreadOnly=true`, {
    headers: { Authorization: `Bearer ${makeToken(student)}` },
  });
  assert.equal(unsubscribeResponse.status, 200);
  const unsubscribeBody = await unsubscribeResponse.json();
  assert.equal(unsubscribeBody.notifications.length, 0);

  const moderator = await User.create({ name: "Mod One", email: "mod-one@example.com", password: "hash", role: "MODERATOR", emailVerified: true });
  const reviewResponse = await fetch(`${baseUrl}/api/notes/${uploadBody.note._id}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(moderator)}`,
    },
    body: JSON.stringify({ action: "approved" }),
  });

  assert.equal(reviewResponse.status, 200);
  const reviewBody = await reviewResponse.json();
  assert.equal(reviewBody.note.status, "approved");

  const latestNotifications = await Notification.find({ userId: student._id }).sort({ createdAt: -1 }).lean();
  assert.equal(latestNotifications.some((item) => item.title === "Note reviewed"), true);
});

test("admins can view a dashboard overview with aggregate data", async () => {
  const admin = await User.create({ name: "Admin User", email: "admin@example.com", password: "hash", role: "ADMIN", emailVerified: true });
  const student = await User.create({ name: "Student Beta", email: "student-beta@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const course = await Course.create({ name: "Math", slug: "math", description: "Mathematics" });
  const subject = await Subject.create({ courseId: course._id, name: "Calculus", code: "MTH101", semester: 1 });

  await Note.create({
    uploaderId: student._id,
    courseId: course._id,
    subjectId: subject._id,
    title: "Limits Notes",
    description: "Short notes on limit analysis.",
    fileName: "limits.pdf",
    storagePath: "uploads/limits.pdf",
    fileSize: 700,
    mimeType: "application/pdf",
    checksum: "phase7-checksum-2",
    status: "approved",
    reviewDueAt: new Date(Date.now() + 60000),
  });

  await Notification.create({
    userId: admin._id,
    type: "system",
    title: "Dashboard ready",
    message: "Analytics have loaded.",
  });

  const response = await fetch(`${baseUrl}/api/dashboard/overview`, {
    headers: { Authorization: `Bearer ${makeToken(admin)}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.summary.totalUsers >= 2, true);
  assert.equal(body.summary.totalNotes >= 1, true);
  assert.equal(Array.isArray(body.recentNotes), true);
  assert.equal(body.summary.unreadNotifications >= 1, true);
});

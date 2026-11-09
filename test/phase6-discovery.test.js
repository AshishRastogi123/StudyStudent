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
const Bookmark = require("../models/Bookmark");
const Report = require("../models/Report");

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
    Bookmark.deleteMany({}),
    Report.deleteMany({}),
  ]);
};

test.before(async () => {
  process.env.JWT_SECRET = "phase-6-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase6");
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

test("approved notes are searchable and bookmarkable", async () => {
  const student = await User.create({ name: "Alice Student", email: "alice@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const viewer = await User.create({ name: "Bob Viewer", email: "bob@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const course = await Course.create({ name: "Computer Science", slug: "computer-science", description: "CS notes" });
  const subject = await Subject.create({ courseId: course._id, name: "Algorithms", code: "CS201", semester: 2 });

  const note = await Note.create({
    uploaderId: student._id,
    courseId: course._id,
    subjectId: subject._id,
    title: "Dynamic Programming Cheatsheet",
    description: "Covers optimization and recurrence relations.",
    fileName: "dp-cheatsheet.pdf",
    storagePath: "uploads/dp-cheatsheet.pdf",
    fileSize: 1200,
    mimeType: "application/pdf",
    checksum: "checksum-abc-1",
    status: "approved",
    reviewDueAt: new Date(Date.now() + 60000),
  });

  const publicResponse = await fetch(`${baseUrl}/api/notes/public?q=dynamic&courseId=${course._id}`);
  assert.equal(publicResponse.status, 200);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.notes.length, 1);
  assert.equal(publicBody.notes[0].title, "Dynamic Programming Cheatsheet");

  const detailResponse = await fetch(`${baseUrl}/api/notes/${note._id}`);
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.note.title, "Dynamic Programming Cheatsheet");

  const bookmarkResponse = await fetch(`${baseUrl}/api/notes/${note._id}/bookmark`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(viewer)}`,
    },
  });

  assert.equal(bookmarkResponse.status, 201);
  const bookmarkBody = await bookmarkResponse.json();
  assert.equal(bookmarkBody.bookmarked, true);

  const bookmarkListResponse = await fetch(`${baseUrl}/api/notes/bookmarks`, {
    headers: { Authorization: `Bearer ${makeToken(viewer)}` },
  });

  assert.equal(bookmarkListResponse.status, 200);
  const bookmarkListBody = await bookmarkListResponse.json();
  assert.equal(bookmarkListBody.bookmarks.length, 1);

  const duplicateBookmarkResponse = await fetch(`${baseUrl}/api/notes/${note._id}/bookmark`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(viewer)}`,
    },
  });

  assert.equal(duplicateBookmarkResponse.status, 200);
  const duplicateBookmarkBody = await duplicateBookmarkResponse.json();
  assert.equal(duplicateBookmarkBody.bookmarked, false);
});

test("notes can be reported once and moderators can view the reports list", async () => {
  const student = await User.create({ name: "Charlie Student", email: "charlie@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const moderator = await User.create({ name: "Dana Moderator", email: "dana@example.com", password: "hash", role: "MODERATOR", emailVerified: true });
  const course = await Course.create({ name: "Physics", slug: "physics", description: "Physical sciences" });
  const subject = await Subject.create({ courseId: course._id, name: "Mechanics", code: "PH201", semester: 2 });

  const note = await Note.create({
    uploaderId: student._id,
    courseId: course._id,
    subjectId: subject._id,
    title: "Motion Notes",
    description: "Notes on force and acceleration.",
    fileName: "motion-notes.pdf",
    storagePath: "uploads/motion-notes.pdf",
    fileSize: 1500,
    mimeType: "application/pdf",
    checksum: "checksum-xyz-1",
    status: "approved",
    reviewDueAt: new Date(Date.now() + 60000),
  });

  const invalidReportResponse = await fetch(`${baseUrl}/api/notes/${note._id}/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({ reason: "bad-reason", details: "This is invalid." }),
  });

  assert.equal(invalidReportResponse.status, 400);

  const validReportResponse = await fetch(`${baseUrl}/api/notes/${note._id}/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({ reason: "inappropriate", details: "The content seems unsuitable." }),
  });

  assert.equal(validReportResponse.status, 201);
  const validReportBody = await validReportResponse.json();
  assert.equal(validReportBody.report.reason, "inappropriate");

  const duplicateReportResponse = await fetch(`${baseUrl}/api/notes/${note._id}/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({ reason: "spam", details: "Duplicate submission." }),
  });

  assert.equal(duplicateReportResponse.status, 409);

  const reportsResponse = await fetch(`${baseUrl}/api/notes/reports`, {
    headers: { Authorization: `Bearer ${makeToken(moderator)}` },
  });

  assert.equal(reportsResponse.status, 200);
  const reportsBody = await reportsResponse.json();
  assert.equal(reportsBody.reports.length, 1);
  assert.equal(reportsBody.reports[0].reason, "inappropriate");
});

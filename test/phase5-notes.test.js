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
  ]);
};

test.before(async () => {
  process.env.JWT_SECRET = "phase-5-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase5");
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

test("student can upload pending notes and moderator can reject or approve them", async () => {
  const student = await User.create({ name: "Study Student", email: "student@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const moderator = await User.create({ name: "Review Moderator", email: "moderator@example.com", password: "hash", role: "MODERATOR", emailVerified: true });
  const course = await Course.create({ name: "B.Tech", slug: "b-tech", description: "Engineering" });
  const subject = await Subject.create({ courseId: course._id, name: "Data Structures", code: "DS101", semester: 1 });

  const uploadResponse = await fetch(`${baseUrl}/api/notes/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({
      courseId: course._id,
      subjectId: subject._id,
      title: "DS Notes",
      description: "Important notes for arrays and graphs.",
      fileName: "ds-notes.pdf",
      storagePath: "uploads/ds-notes.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      checksum: "hash-abc-123",
    }),
  });

  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();
  assert.equal(uploadBody.note.status, "pending");

  const moderationResponse = await fetch(`${baseUrl}/api/notes/${uploadBody.note._id}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(moderator)}`,
    },
    body: JSON.stringify({ action: "approved" }),
  });

  assert.equal(moderationResponse.status, 200);
  const moderationBody = await moderationResponse.json();
  assert.equal(moderationBody.note.status, "approved");

  const queueResponse = await fetch(`${baseUrl}/api/notes/queue`, {
    headers: { Authorization: `Bearer ${makeToken(moderator)}` },
  });

  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  assert.equal(Array.isArray(queueBody.notes), true);
});

test("students cannot review notes and rejected notes require valid reasons", async () => {
  const student = await User.create({ name: "Student Only", email: "student2@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const moderator = await User.create({ name: "Moderator Only", email: "moderator2@example.com", password: "hash", role: "MODERATOR", emailVerified: true });
  const course = await Course.create({ name: "MBA", slug: "mba", description: "Management" });
  const subject = await Subject.create({ courseId: course._id, name: "Marketing", code: "MK101", semester: 1 });

  const noteResponse = await fetch(`${baseUrl}/api/notes/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({
      courseId: course._id,
      subjectId: subject._id,
      title: "Marketing Notes",
      description: "Sample notes",
      fileName: "marketing.pdf",
      storagePath: "uploads/marketing.pdf",
      fileSize: 800,
      mimeType: "application/pdf",
      checksum: "hash-xyz-456",
    }),
  });

  const note = (await noteResponse.json()).note;

  const invalidStudentReviewResponse = await fetch(`${baseUrl}/api/notes/${note._id}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(student)}`,
    },
    body: JSON.stringify({ action: "rejected", reason: "Duplicate notes" }),
  });

  assert.equal(invalidStudentReviewResponse.status, 403);

  const invalidReasonResponse = await fetch(`${baseUrl}/api/notes/${note._id}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken(moderator)}`,
    },
    body: JSON.stringify({ action: "rejected", reason: "Not on list" }),
  });

  assert.equal(invalidReasonResponse.status, 400);
  assert.equal((await invalidReasonResponse.json()).message, "A valid rejection reason is required for rejected notes.");
});

test("admin can browse notes across users while students cannot use the admin listing", async () => {
  const student = await User.create({ name: "Note Owner", email: "note-owner@example.com", password: "hash", role: "STUDENT", emailVerified: true });
  const admin = await User.create({ name: "Notes Admin", email: "notes-admin@example.com", password: "hash", role: "ADMIN", emailVerified: true });
  const course = await Course.create({ name: "Chemistry", slug: "chemistry", description: "Chemistry course" });
  const subject = await Subject.create({ courseId: course._id, name: "Organic Chemistry", code: "CH101", semester: 1 });
  const note = await Note.create({
    userId: student._id,
    uploaderId: student._id,
    courseId: course._id,
    subjectId: subject._id,
    title: "Organic reactions",
    description: "Reaction summary",
    fileName: "reactions.pdf",
    storagePath: "notes/private/reactions.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum: "admin-all-notes-checksum",
    status: "pending",
  });

  const adminResponse = await fetch(`${baseUrl}/api/notes/all?userId=${student._id}&status=pending`, {
    headers: { Authorization: "Bearer " + makeToken(admin) },
  });
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.json();
  assert.equal(adminBody.pagination.total, 1);
  assert.equal(adminBody.notes[0]._id, String(note._id));
  assert.equal(adminBody.notes[0].userId.email, student.email);
  assert.equal(adminBody.notes[0].courseId.name, course.name);

  const studentResponse = await fetch(`${baseUrl}/api/notes/all`, {
    headers: { Authorization: "Bearer " + makeToken(student) },
  });
  assert.equal(studentResponse.status, 403);
});

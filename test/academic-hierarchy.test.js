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
const Unit = require("../models/Unit");
const Topic = require("../models/Topic");

let mongoServer;
let httpServer;
let baseUrl;

const adminUser = {
  name: "Admin User",
  email: "admin.phase3@example.com",
  password: "secret123",
  role: "ADMIN",
};

const studentUser = {
  name: "Student User",
  email: "student.phase3@example.com",
  password: "secret123",
  role: "STUDENT",
};

const createToken = (user) => jwt.sign({ id: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" });

const resetDb = async () => {
  await Promise.all([
    User.deleteMany({}),
    Course.deleteMany({}),
    Subject.deleteMany({}),
    Unit.deleteMany({}),
    Topic.deleteMany({}),
  ]);
};

test.before(async () => {
  process.env.JWT_SECRET = "phase-3-test-secret";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri("studystudent_phase3");
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

test("admin can create a course and nested academic hierarchy", async () => {
  const admin = await User.create(adminUser);
  const token = createToken(admin);

  const createCourseResponse = await fetch(`${baseUrl}/api/academic/courses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "MCA", description: "Master of Computer Applications" }),
  });

  assert.equal(createCourseResponse.status, 201);
  const course = (await createCourseResponse.json()).course;

  const subjectResponse = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ courseId: course._id, name: "Artificial Intelligence", code: "AI101", semester: 1, description: "AI basics" }),
  });

  assert.equal(subjectResponse.status, 201);
  const subject = (await subjectResponse.json()).subject;

  const unitResponse = await fetch(`${baseUrl}/api/academic/units`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subjectId: subject._id, name: "Unit 1", position: 1 }),
  });

  assert.equal(unitResponse.status, 201);
  const unit = (await unitResponse.json()).unit;

  const topicResponse = await fetch(`${baseUrl}/api/academic/topics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ unitId: unit._id, name: "Introduction to AI", position: 1 }),
  });

  assert.equal(topicResponse.status, 201);

  const hierarchyResponse = await fetch(`${baseUrl}/api/academic/hierarchy`);
  assert.equal(hierarchyResponse.status, 200);
  const hierarchy = await hierarchyResponse.json();
  assert.equal(hierarchy.courses.length, 1);
  assert.equal(hierarchy.courses[0].subjects.length, 1);
  assert.equal(hierarchy.courses[0].subjects[0].units.length, 1);
  assert.equal(hierarchy.courses[0].subjects[0].units[0].topics.length, 1);
});

test("students cannot create academic content and duplicate names are rejected in the same scope", async () => {
  const admin = await User.create(adminUser);
  const student = await User.create(studentUser);
  const token = jwt.sign({ id: student._id.toString(), email: student.email, role: student.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" });

  const course = await Course.create({ name: "BCA", slug: "bca", description: "Bachelor of Computer Applications" });
  const subject = await Subject.create({ courseId: course._id, name: "Python Programming", code: "PY101", semester: 1 });

  const forbiddenResponse = await fetch(`${baseUrl}/api/academic/courses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Unauthorized course" }),
  });

  assert.equal(forbiddenResponse.status, 403);

  const duplicateSubjectResponse = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ id: admin._id.toString(), email: admin.email, role: admin.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" })}`,
    },
    body: JSON.stringify({ courseId: course._id, name: "Python Programming", code: "PY102" }),
  });

  assert.equal(duplicateSubjectResponse.status, 409);
  assert.equal((await duplicateSubjectResponse.json()).message, "A subject with this name already exists in this course.");

  const duplicateUnitResponse = await fetch(`${baseUrl}/api/academic/units`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ id: admin._id.toString(), email: admin.email, role: admin.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" })}`,
    },
    body: JSON.stringify({ subjectId: subject._id, name: "Unit 1" }),
  });

  assert.equal(duplicateUnitResponse.status, 201);
  const duplicateSecondUnitResponse = await fetch(`${baseUrl}/api/academic/units`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ id: admin._id.toString(), email: admin.email, role: admin.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1h" })}`,
    },
    body: JSON.stringify({ subjectId: subject._id, name: "Unit 1" }),
  });

  assert.equal(duplicateSecondUnitResponse.status, 409);
});

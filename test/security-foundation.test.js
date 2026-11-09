const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAuth, requireRole, normalizeRole } = require("../middleware/auth");

const createResponse = () => {
  const res = { statusCode: 200, payload: null };
  res.status = (status) => {
    res.statusCode = status;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

test("normalizeRole converts role values to uppercase for validation", () => {
  assert.equal(normalizeRole("student"), "STUDENT");
  assert.equal(normalizeRole("MODERATOR"), "MODERATOR");
});

test("requireRole blocks unauthorized users", () => {
  let nextCalled = false;
  const req = { user: { id: "u1", role: "STUDENT" } };
  const res = createResponse();

  requireRole("ADMIN")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, "You do not have permission to perform this action.");
});

test("requireRole allows the matching role", () => {
  let nextCalled = false;
  const req = { user: { id: "u2", role: ["STUDENT", "MODERATOR"] } };
  const res = createResponse();

  requireRole("MODERATOR")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAuth rejects missing credentials", () => {
  const req = {};
  const res = createResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.message, "Authentication required.");
});

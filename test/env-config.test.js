const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAppConfig } = require("../config/env");

test("environment validation passes with required values", () => {
  process.env.PORT = "3000";
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017/studystudent";
  process.env.JWT_SECRET = "phase-2-test-secret";
  process.env.SESSION_COOKIE_NAME = "studystudent_session";
  process.env.NODE_ENV = "test";

  const config = validateAppConfig();
  assert.equal(config.port, 3000);
  assert.equal(config.mongoUri, "mongodb://127.0.0.1:27017/studystudent");
  assert.equal(config.jwtSecret, "phase-2-test-secret");
});

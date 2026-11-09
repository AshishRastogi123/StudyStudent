const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { validateAppConfig } = require("../config/env");
const User = require("../models/User");
const Course = require("../models/Course");

(async () => {
  try {
    validateAppConfig();
    await connectDB();

    await User.collection.createIndex({ email: 1 }, { unique: true, background: true });
    await User.collection.createIndex({ role: 1, isActive: 1 }, { background: true });
    await Course.collection.createIndex({ slug: 1 }, { unique: true, background: true });

    const sampleCourses = [
      { name: "Computer Science", slug: "computer-science", description: "Core software and systems fundamentals." },
      { name: "Business Management", slug: "business-management", description: "Operations, strategy, and entrepreneurship." },
    ];

    for (const course of sampleCourses) {
      await Course.updateOne({ slug: course.slug }, { $setOnInsert: course }, { upsert: true });
    }

    console.log("Core MongoDB schema indexes and seed data initialized");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
})();

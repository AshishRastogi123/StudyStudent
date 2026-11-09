const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { validateAppConfig } = require("../config/env");
const Subject = require("../models/Subject");
const Unit = require("../models/Unit");
const Topic = require("../models/Topic");

(async () => {
  try {
    validateAppConfig();
    await connectDB();

    await Subject.collection.createIndex({ courseId: 1, name: 1 }, { unique: true, background: true });
    await Subject.collection.createIndex({ courseId: 1, isActive: 1 }, { background: true });
    await Unit.collection.createIndex({ subjectId: 1, name: 1 }, { unique: true, background: true });
    await Unit.collection.createIndex({ subjectId: 1, position: 1 }, { background: true });
    await Topic.collection.createIndex({ unitId: 1, name: 1 }, { unique: true, background: true });
    await Topic.collection.createIndex({ unitId: 1, position: 1 }, { background: true });

    console.log("Academic hierarchy indexes initialized");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Academic hierarchy migration failed:", error);
    process.exit(1);
  }
})();

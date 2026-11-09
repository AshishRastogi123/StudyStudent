const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Bookmark = require("../models/Bookmark");
const Report = require("../models/Report");

async function runMigration() {
  await connectDB();

  await Bookmark.collection.createIndex({ userId: 1, noteId: 1 }, { unique: true });
  await Bookmark.collection.createIndex({ userId: 1, createdAt: -1 });
  await Report.collection.createIndex({ noteId: 1, status: 1 });
  await Report.collection.createIndex({ reporterId: 1, noteId: 1 }, { unique: true });

  console.log("Note discovery migration complete.");
  await mongoose.disconnect();
}

runMigration().catch((error) => {
  console.error("Failed to run note discovery migration:", error);
  process.exit(1);
});

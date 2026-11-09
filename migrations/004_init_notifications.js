const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Notification = require("../models/Notification");

async function runMigration() {
  await connectDB();

  await Notification.collection.createIndex({ userId: 1, isRead: 1, createdAt: -1 });
  await Notification.collection.createIndex({ userId: 1, createdAt: -1 });

  console.log("Notifications migration complete.");
  await mongoose.disconnect();
}

runMigration().catch((error) => {
  console.error("Failed to run notifications migration:", error);
  process.exit(1);
});

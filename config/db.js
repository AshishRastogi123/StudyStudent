const mongoose = require("mongoose");
const { validateAppConfig } = require("./env");

const connectDB = async () => {
  const config = validateAppConfig();
  mongoose.set("strictQuery", true);

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connected");
};

module.exports = connectDB;

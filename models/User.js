const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, default: "" },
    role: {
      type: String,
      enum: ["STUDENT", "MODERATOR", "ADMIN"],
      default: "STUDENT",
    },
    profile: {
      bio: { type: String, default: "" },
      avatarUrl: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    authProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model("User", userSchema);

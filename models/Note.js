const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    fileName: { type: String, required: true },
    storagePath: { type: String, required: true },
    storageProvider: { type: String, enum: ["local", "supabase"], default: "local" },
    fileSize: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true },
    checksum: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "removed"],
      default: "pending",
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
    },
    rejectionReason: { type: String, default: "" },
    reviewDueAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

noteSchema.pre("validate", function (next) {
  if (!this.userId && this.uploaderId) {
    this.userId = this.uploaderId;
  }

  if (!this.uploaderId && this.userId) {
    this.uploaderId = this.userId;
  }

  if (this.status === "approved") {
    this.visibility = "public";
  }

  if (this.status === "rejected" || this.status === "pending") {
    this.visibility = "private";
  }

  next();
});

noteSchema.index({ userId: 1, status: 1 });
noteSchema.index({ uploaderId: 1, status: 1 });
noteSchema.index({ courseId: 1, status: 1 });

module.exports = mongoose.model("Note", noteSchema);

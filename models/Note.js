const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    fileName: { type: String, required: true },
    storagePath: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true },
    checksum: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "removed"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    reviewDueAt: { type: Date, required: true },
    reviewedAt: { type: Date, default: null },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

noteSchema.index({ uploaderId: 1, status: 1 });
noteSchema.index({ courseId: 1, status: 1 });

module.exports = mongoose.model("Note", noteSchema);

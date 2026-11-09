const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    noteId: { type: mongoose.Schema.Types.ObjectId, ref: "Note", required: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["approved", "rejected", "removed"], required: true },
    reason: { type: String, default: "" },
  },
  { timestamps: true }
);

reviewSchema.index({ noteId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);

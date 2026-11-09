const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    noteId: { type: mongoose.Schema.Types.ObjectId, ref: "Note", required: true },
    reason: {
      type: String,
      enum: ["copyright", "inappropriate", "spam", "duplicate", "incorrect", "other"],
      required: true,
    },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "reviewed", "resolved"],
      default: "open",
    },
  },
  { timestamps: true }
);

reportSchema.index({ noteId: 1, status: 1 });
reportSchema.index({ reporterId: 1, noteId: 1 }, { unique: true });

module.exports = mongoose.model("Report", reportSchema);

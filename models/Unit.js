const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    name: { type: String, required: true, trim: true },
    position: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

unitSchema.index({ subjectId: 1, name: 1 }, { unique: true });
unitSchema.index({ subjectId: 1, position: 1 });

module.exports = mongoose.model("Unit", unitSchema);

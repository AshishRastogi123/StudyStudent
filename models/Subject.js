const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    semester: { type: Number, default: 1, min: 1 },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

subjectSchema.index({ courseId: 1, name: 1 }, { unique: true });
subjectSchema.index({ courseId: 1, isActive: 1 });

module.exports = mongoose.model("Subject", subjectSchema);

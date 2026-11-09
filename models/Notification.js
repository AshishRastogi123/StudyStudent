const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["note_status", "system", "report", "security", "general"],
      default: "general",
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    relatedModel: { type: String, default: "" },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isRead: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);

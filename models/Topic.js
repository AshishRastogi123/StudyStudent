const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    name: { type: String, required: true, trim: true },
    position: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

topicSchema.index({ unitId: 1, name: 1 }, { unique: true });
topicSchema.index({ unitId: 1, position: 1 });

module.exports = mongoose.model("Topic", topicSchema);

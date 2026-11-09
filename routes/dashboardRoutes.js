const express = require("express");
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const Note = require("../models/Note");
const Report = require("../models/Report");
const Bookmark = require("../models/Bookmark");
const Notification = require("../models/Notification");

const router = express.Router();

router.get("/overview", requireAuth, async (req, res) => {
  try {
    const [totalUsers, totalNotes, openReports, totalBookmarks, unreadNotifications] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Note.countDocuments({}),
      Report.countDocuments({ status: "open" }),
      Bookmark.countDocuments({}),
      Notification.countDocuments({ userId: req.user.id, isRead: false }),
    ]);

    const notesByStatus = await Note.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const usersByRole = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    const recentNotes = await Note.find({ status: "approved" })
      .populate("courseId", "name slug")
      .populate("subjectId", "name code")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return res.json({
      summary: {
        totalUsers,
        totalNotes,
        openReports,
        totalBookmarks,
        unreadNotifications,
      },
      notesByStatus: notesByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      usersByRole: usersByRole.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentNotes,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load dashboard overview." });
  }
});

module.exports = router;

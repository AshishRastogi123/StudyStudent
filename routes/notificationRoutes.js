const express = require("express");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { unreadOnly = "false" } = req.query;
    const filter = { userId: req.user.id };
    if (String(unreadOnly).toLowerCase() === "true") {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ notifications, unreadCount: notifications.filter((n) => !n.isRead).length });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch notifications." });
  }
});

router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user.id });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    notification.isRead = true;
    await notification.save();

    return res.json({ message: "Notification marked as read.", notification });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update notification." });
  }
});

router.patch("/mark-all-read", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, isRead: false }, { $set: { isRead: true } });
    return res.json({ message: "All notifications marked as read." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update notifications." });
  }
});

router.post("/seed-system", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const notification = await Notification.create({
      userId: user._id,
      type: "system",
      title: "Welcome to StudyStudent",
      message: "Your account is ready. Explore notes, bookmarks, and moderation tools.",
    });

    return res.status(201).json({ notification });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create notification." });
  }
});

module.exports = router;

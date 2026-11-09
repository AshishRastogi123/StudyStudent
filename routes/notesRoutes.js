const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const Course = require("../models/Course");
const Subject = require("../models/Subject");
const Note = require("../models/Note");
const Review = require("../models/Review");

const router = express.Router();

const validStatuses = ["pending", "approved", "rejected", "removed"];
const validReviewActions = ["approved", "rejected", "removed"];
const reviewReasonOptions = [
  "Incorrect subject",
  "Poor PDF quality",
  "Duplicate notes",
  "Copyright concern",
  "Irrelevant content",
  "Inappropriate material",
  "Other",
];

router.post("/upload", requireAuth, async (req, res) => {
  try {
    const { courseId, subjectId, title, description, fileName, storagePath, fileSize, mimeType, checksum } = req.body || {};

    if (!courseId || !subjectId || !title || !fileName || !storagePath || !fileSize || !mimeType || !checksum) {
      return res.status(400).json({ message: "Missing required note metadata." });
    }

    const subject = await Subject.findById(subjectId);
    if (!subject || !subject.isActive) {
      return res.status(404).json({ message: "Subject not found." });
    }

    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (String(subject.courseId) !== String(course._id)) {
      return res.status(400).json({ message: "Selected subject does not belong to the selected course." });
    }

    const normalizedChecksum = String(checksum).trim();
    const existingDuplicate = await Note.findOne({ checksum: normalizedChecksum, status: { $in: ["pending", "approved", "rejected"] } });
    if (existingDuplicate) {
      return res.status(409).json({ message: "A similar note has already been submitted." });
    }

    const note = await Note.create({
      uploaderId: req.user.id,
      courseId,
      subjectId,
      title: String(title).trim(),
      description: description || "",
      fileName: String(fileName).trim(),
      storagePath: String(storagePath).trim(),
      fileSize: Number(fileSize),
      mimeType: String(mimeType).trim(),
      checksum: normalizedChecksum,
      status: "pending",
      reviewDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reviewedAt: null,
      downloadCount: 0,
    });

    return res.status(201).json({
      message: "Note submitted successfully and is now pending review.",
      note,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to upload note." });
  }
});

router.get("/my-submissions", requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({ uploaderId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch submissions." });
  }
});

router.get("/queue", requireAuth, requireRole("MODERATOR", "ADMIN"), async (req, res) => {
  try {
    const notes = await Note.find({ status: "pending" }).sort({ reviewDueAt: 1 }).lean();
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch moderation queue." });
  }
});

router.post("/:id/review", requireAuth, requireRole("MODERATOR", "ADMIN"), async (req, res) => {
  try {
    const { action, reason } = req.body || {};
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    const reviewAction = String(action || "").trim();
    if (!validReviewActions.includes(reviewAction)) {
      return res.status(400).json({ message: "Review action is invalid." });
    }

    if (reviewAction === "rejected" && (!reason || !reviewReasonOptions.includes(String(reason).trim()))) {
      return res.status(400).json({ message: "A valid rejection reason is required for rejected notes." });
    }

    note.status = reviewAction;
    note.rejectionReason = reviewAction === "rejected" ? String(reason).trim() : "";
    note.reviewedAt = new Date();
    await note.save();

    const review = await Review.create({
      noteId: note._id,
      reviewerId: req.user.id,
      action: reviewAction,
      reason: reviewAction === "rejected" ? String(reason).trim() : "",
    });

    return res.json({
      message: `Note ${reviewAction} successfully.`,
      note,
      review,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to process review." });
  }
});

router.get("/all", requireAuth, requireRole("MODERATOR", "ADMIN"), async (req, res) => {
  try {
    const notes = await Note.find({ status: { $in: validStatuses } }).sort({ createdAt: -1 });
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch notes." });
  }
});

module.exports = router;

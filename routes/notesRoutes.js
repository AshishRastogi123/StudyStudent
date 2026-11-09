const express = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middleware/auth");
const Course = require("../models/Course");
const Subject = require("../models/Subject");
const User = require("../models/User");
const Note = require("../models/Note");
const Review = require("../models/Review");
const Bookmark = require("../models/Bookmark");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const storageService = require("../services/storageService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const validationError = storageService.validateUploadFile(file);
    if (validationError) {
      return cb(new Error(validationError));
    }
    return cb(null, true);
  },
});

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
const reportReasonOptions = ["copyright", "inappropriate", "spam", "duplicate", "incorrect", "other"];

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildApprovedStoragePath = (storagePath) => {
  if (!storagePath) return storagePath;
  return storagePath.replace("notes/private/", "notes/approved/");
};

router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const body = req.body || {};
    const { courseId, subjectId, title, description, fileName, storagePath, fileSize, mimeType, checksum } = body;

    const incomingTitle = String(title || "").trim();
    const resolvedFileName = String(fileName || req.file?.originalname || "upload").trim();
    const resolvedMimeType = String(mimeType || req.file?.mimetype || "application/octet-stream").trim();
    const resolvedFileSize = Number(fileSize || req.file?.size || 0);
    const normalizedChecksum = checksum ? String(checksum).trim() : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    if (!courseId || !subjectId || !incomingTitle) {
      return res.status(400).json({ message: "Course, subject and title are required." });
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

    const existingDuplicate = await Note.findOne({ checksum: normalizedChecksum, status: { $in: ["pending", "approved", "rejected"] } });
    if (existingDuplicate) {
      return res.status(409).json({ message: "A similar note has already been submitted." });
    }

    let uploadedStoragePath = String(storagePath || "").trim();
    let uploadedFileName = resolvedFileName;
    let uploadedMimeType = resolvedMimeType;
    let uploadedFileSize = resolvedFileSize;
    let storageProvider = String(body.storageProvider || (req.file ? "supabase" : "local")).trim().toLowerCase() || "local";

    if (req.file) {
      try {
        const uploadedFile = await storageService.uploadNoteFile({
          userId: req.user.id,
          file: req.file,
          noteTitle: incomingTitle,
        });
        uploadedStoragePath = uploadedFile.storagePath;
        uploadedFileName = uploadedFile.fileName;
        uploadedMimeType = uploadedFile.mimeType;
        uploadedFileSize = uploadedFile.fileSize;
        storageProvider = uploadedFile.storageProvider;
      } catch (error) {
        return res.status(400).json({ message: error.message || "File upload failed." });
      }
    } else if (!uploadedStoragePath) {
      return res.status(400).json({ message: "A note file is required." });
    }

    try {
      const note = await Note.create({
        userId: req.user.id,
        uploaderId: req.user.id,
        courseId,
        subjectId,
        title: incomingTitle,
        description: description || "",
        fileName: uploadedFileName,
        storagePath: uploadedStoragePath,
        storageProvider,
        fileSize: uploadedFileSize,
        mimeType: uploadedMimeType,
        checksum: normalizedChecksum,
        status: "pending",
        visibility: "private",
        reviewDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        reviewedBy: null,
        reviewedAt: null,
        approvedAt: null,
        rejectionReason: "",
        downloadCount: 0,
      });

      await Notification.create({
        userId: req.user.id,
        type: "note_status",
        title: "Note submitted",
        message: "Your note is now pending moderator review.",
        relatedModel: "Note",
        relatedId: note._id,
      });

      return res.status(201).json({
        message: "Note submitted successfully and is now pending review.",
        note,
      });
    } catch (error) {
      if (req.file && uploadedStoragePath) {
        try {
          await storageService.deleteStorageObject({ storagePath: uploadedStoragePath, storageProvider });
        } catch (cleanupError) {
          console.error("Failed to clean up uploaded object after MongoDB save failure:", cleanupError);
        }
      }
      console.error("Note upload failed:", error);
      return res.status(500).json({ message: "Unable to upload note." });
    }
  } catch (error) {
    console.error("Upload route failed:", error);
    return res.status(500).json({ message: error.message || "Unable to upload note." });
  }
});

router.get("/public", async (req, res) => {
  try {
    const { q, courseId, subjectId, page = 1, limit = 20 } = req.query;
    const query = { status: "approved", visibility: "public" };

    if (courseId) query.courseId = courseId;
    if (subjectId) query.subjectId = subjectId;

    if (q && String(q).trim()) {
      const searchTerm = escapeRegex(String(q).trim());
      query.$or = [
        { title: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
        { fileName: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (pageNumber - 1) * pageSize;

    const [notes, total] = await Promise.all([
      Note.find(query)
        .populate("courseId", "name slug")
        .populate("subjectId", "name code")
        .populate("uploaderId", "name email")
        .sort({ approvedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Note.countDocuments(query),
    ]);

    return res.json({
      notes,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to discover notes." });
  }
});

router.get("/my-notes", requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch my notes." });
  }
});

router.get("/my-submissions", requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ notes });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch submissions." });
  }
});

router.get("/bookmarks", requireAuth, async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ userId: req.user.id })
      .populate({
        path: "noteId",
        populate: [
          { path: "courseId", select: "name slug" },
          { path: "subjectId", select: "name code" },
          { path: "uploaderId", select: "name email" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ bookmarks });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch bookmarks." });
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

router.get("/reports", requireAuth, requireRole("MODERATOR", "ADMIN"), async (req, res) => {
  try {
    const reports = await Report.find({})
      .populate("reporterId", "name email")
      .populate({
        path: "noteId",
        populate: [
          { path: "courseId", select: "name slug" },
          { path: "subjectId", select: "name code" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ reports });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch reports." });
  }
});

router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    const canAccessNote = String(note.userId || note.uploaderId) === String(req.user.id) || req.user.role === "MODERATOR" || req.user.role === "ADMIN" || note.status === "approved";
    if (!canAccessNote) {
      return res.status(403).json({ message: "You do not have permission to access this note." });
    }

    if (note.storageProvider === "supabase") {
      const signedUrl = await storageService.getSignedDownloadUrl({ storagePath: note.storagePath, storageProvider: "supabase" });
      return res.json({
        message: "Signed URL generated securely.",
        fileName: note.fileName,
        mimeType: note.mimeType,
        signedUrl,
      });
    }

    return res.json({
      message: "File is stored locally.",
      fileName: note.fileName,
      mimeType: note.mimeType,
      storagePath: note.storagePath,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to generate download access." });
  }
});

router.post("/:id/bookmark", requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || note.status !== "approved") {
      return res.status(404).json({ message: "Approved note not found." });
    }

    const existing = await Bookmark.findOne({ userId: req.user.id, noteId: note._id });
    if (existing) {
      await existing.deleteOne();
      return res.json({ message: "Bookmark removed.", bookmarked: false, noteId: note._id });
    }

    const bookmark = await Bookmark.create({
      userId: req.user.id,
      noteId: note._id,
    });

    return res.status(201).json({ message: "Bookmark added.", bookmarked: true, bookmark });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update bookmark." });
  }
});

router.post("/:id/report", requireAuth, async (req, res) => {
  try {
    const { reason, details } = req.body || {};
    const normalizedReason = String(reason || "").trim().toLowerCase();

    if (!reportReasonOptions.includes(normalizedReason)) {
      return res.status(400).json({ message: "A valid report reason is required." });
    }

    const note = await Note.findById(req.params.id);
    if (!note || note.status !== "approved") {
      return res.status(404).json({ message: "Approved note not found." });
    }

    const existingReport = await Report.findOne({ reporterId: req.user.id, noteId: note._id });
    if (existingReport) {
      return res.status(409).json({ message: "You have already reported this note." });
    }

    const report = await Report.create({
      reporterId: req.user.id,
      noteId: note._id,
      reason: normalizedReason,
      details: details ? String(details).trim() : "",
      status: "open",
    });

    const moderators = await User.find({ role: { $in: ["MODERATOR", "ADMIN"] } }).select("_id");
    if (moderators.length > 0) {
      const notifications = moderators.map((moderator) => ({
        userId: moderator._id,
        type: "report",
        title: "New note report",
        message: `A note titled "${note.title}" was reported for ${normalizedReason}.`,
        relatedModel: "Report",
        relatedId: report._id,
        metadata: { noteId: String(note._id), reason: normalizedReason },
      }));
      await Notification.insertMany(notifications);
    }

    return res.status(201).json({ message: "Report submitted successfully.", report });
  } catch (error) {
    return res.status(500).json({ message: "Unable to submit report." });
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

    if (reviewAction === "approved") {
      if (note.storageProvider === "supabase" && note.storagePath) {
        const targetPath = buildApprovedStoragePath(note.storagePath);
        await storageService.moveStorageObject({
          fromPath: note.storagePath,
          toPath: targetPath,
          storageProvider: note.storageProvider,
        });
        note.storagePath = targetPath;
      }
      note.status = "approved";
      note.visibility = "public";
      note.approvedAt = new Date();
    } else if (reviewAction === "rejected") {
      note.status = "rejected";
      note.visibility = "private";
      note.rejectionReason = String(reason).trim();
    } else if (reviewAction === "removed") {
      if (note.storageProvider === "supabase" && note.storagePath) {
        await storageService.deleteStorageObject({ storagePath: note.storagePath, storageProvider: note.storageProvider });
      }
      note.status = "removed";
      note.visibility = "private";
      note.rejectionReason = "Removed by moderator";
    }

    note.reviewedBy = req.user.id;
    note.reviewedAt = new Date();
    await note.save();

    const review = await Review.create({
      noteId: note._id,
      reviewerId: req.user.id,
      action: reviewAction,
      reason: reviewAction === "rejected" ? String(reason).trim() : "",
    });

    await Notification.create({
      userId: note.userId || note.uploaderId,
      type: "note_status",
      title: "Note reviewed",
      message: `Your note "${note.title}" was ${reviewAction}.${reviewAction === "rejected" ? ` Reason: ${String(reason).trim()}.` : ""}`,
      relatedModel: "Note",
      relatedId: note._id,
      metadata: { status: reviewAction },
    });

    return res.json({
      message: `Note ${reviewAction} successfully.`,
      note,
      review,
    });
  } catch (error) {
    console.error("Review processing failed:", error);
    return res.status(500).json({ message: error.message || "Unable to process review." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    const isOwner = String(note.userId || note.uploaderId) === String(req.user.id);
    const isAdmin = req.user.role === "MODERATOR" || req.user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You do not have permission to delete this note." });
    }

    if (note.storageProvider === "supabase" && note.storagePath) {
      try {
        await storageService.deleteStorageObject({ storagePath: note.storagePath, storageProvider: note.storageProvider });
      } catch (cleanupError) {
        console.error("Failed to delete Supabase object for note:", cleanupError);
      }
    }

    await note.deleteOne();
    return res.json({ message: "Note deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to delete note." });
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

router.get("/:id", async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, status: "approved", visibility: "public" })
      .populate("courseId", "name slug")
      .populate("subjectId", "name code")
      .populate("uploaderId", "name email")
      .lean();

    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    return res.json({ note });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch note details." });
  }
});

module.exports = router;

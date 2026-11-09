const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const Course = require("../models/Course");
const Subject = require("../models/Subject");
const Unit = require("../models/Unit");
const Topic = require("../models/Topic");

const router = express.Router();

const slugify = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, "")
  .replace(/\s+/g, "-")
  .replace(/-+/g, "-");

router.get("/courses", async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ courses });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch courses." });
  }
});

router.post("/courses", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Course name is required." });
    }

    const slug = slugify(name) || "course";
    const course = await Course.create({
      name: String(name).trim(),
      slug,
      description: description || "",
      isActive: true,
    });

    return res.status(201).json({ message: "Course created.", course });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "A course with this slug already exists." });
    }
    return res.status(500).json({ message: "Unable to create course." });
  }
});

router.get("/subjects", async (req, res) => {
  try {
    const { courseId, courseSlug } = req.query;
    const query = { isActive: true };

    if (courseId) query.courseId = courseId;
    if (courseSlug) {
      const course = await Course.findOne({ slug: String(courseSlug), isActive: true }).lean();
      if (!course) {
        return res.json({ subjects: [] });
      }
      query.courseId = course._id;
    }

    const subjects = await Subject.find(query).sort({ createdAt: -1 });
    return res.json({ subjects });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch subjects." });
  }
});

router.post("/subjects", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { courseId, name, code, semester, description } = req.body || {};
    if (!courseId || !name || !String(name).trim()) {
      return res.status(400).json({ message: "Course and subject name are required." });
    }

    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(404).json({ message: "Course not found." });
    }

    const subject = await Subject.create({
      courseId,
      name: String(name).trim(),
      code: code ? String(code).trim() : "",
      semester: Number(semester) || 1,
      description: description || "",
      isActive: true,
    });

    return res.status(201).json({ message: "Subject created.", subject });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "A subject with this name already exists in this course." });
    }
    return res.status(500).json({ message: "Unable to create subject." });
  }
});

router.get("/units", async (req, res) => {
  try {
    const { subjectId } = req.query;
    const query = {};
    if (subjectId) query.subjectId = subjectId;
    const units = await Unit.find(query).sort({ position: 1, createdAt: -1 });
    return res.json({ units });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch units." });
  }
});

router.post("/units", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { subjectId, name, position } = req.body || {};
    if (!subjectId || !name || !String(name).trim()) {
      return res.status(400).json({ message: "Subject and unit name are required." });
    }

    const subject = await Subject.findById(subjectId);
    if (!subject || !subject.isActive) {
      return res.status(404).json({ message: "Subject not found." });
    }

    const unit = await Unit.create({
      subjectId,
      name: String(name).trim(),
      position: Number(position) || 1,
      isActive: true,
    });

    return res.status(201).json({ message: "Unit created.", unit });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "A unit with this name already exists in this subject." });
    }
    return res.status(500).json({ message: "Unable to create unit." });
  }
});

router.get("/topics", async (req, res) => {
  try {
    const { unitId } = req.query;
    const query = {};
    if (unitId) query.unitId = unitId;
    const topics = await Topic.find(query).sort({ position: 1, createdAt: -1 });
    return res.json({ topics });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch topics." });
  }
});

router.post("/topics", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { unitId, name, position } = req.body || {};
    if (!unitId || !name || !String(name).trim()) {
      return res.status(400).json({ message: "Unit and topic name are required." });
    }

    const unit = await Unit.findById(unitId);
    if (!unit || !unit.isActive) {
      return res.status(404).json({ message: "Unit not found." });
    }

    const topic = await Topic.create({
      unitId,
      name: String(name).trim(),
      position: Number(position) || 1,
      isActive: true,
    });

    return res.status(201).json({ message: "Topic created.", topic });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "A topic with this name already exists in this unit." });
    }
    return res.status(500).json({ message: "Unable to create topic." });
  }
});

router.get("/hierarchy", async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    const subjects = await Subject.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    const units = await Unit.find({ isActive: true }).sort({ position: 1, createdAt: -1 }).lean();
    const topics = await Topic.find({ isActive: true }).sort({ position: 1, createdAt: -1 }).lean();

    const subjectMap = new Map(subjects.map((subject) => [String(subject._id), subject]));
    const unitMap = new Map(units.map((unit) => [String(unit._id), unit]));

    const courseList = courses.map((course) => {
      const courseSubjects = subjects
        .filter((subject) => String(subject.courseId) === String(course._id))
        .map((subject) => ({
          ...subject,
          units: units
            .filter((unit) => String(unit.subjectId) === String(subject._id))
            .map((unit) => ({
              ...unit,
              topics: topics.filter((topic) => String(topic.unitId) === String(unit._id)),
            })),
        }));

      return {
        ...course,
        subjects: courseSubjects,
      };
    });

    return res.json({ courses: courseList, subjects, units, topics, subjectMap: Object.fromEntries(subjectMap), unitMap: Object.fromEntries(unitMap) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load academic hierarchy." });
  }
});

module.exports = router;

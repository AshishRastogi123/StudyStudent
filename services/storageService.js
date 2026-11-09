const path = require("path");
const crypto = require("crypto");
const { getSupabaseClient, getSupabaseConfig, isSupabaseConfigured } = require("../config/supabase");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".png", ".jpg", ".jpeg"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const sanitizeFileName = (originalName) => {
  const baseName = path.basename(originalName || "note");
  const ext = path.extname(baseName).toLowerCase();
  const sanitizedBase = baseName.replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "note";
  return `${sanitizedBase}${ext}`;
};

const validateUploadFile = (file) => {
  if (!file) {
    return "No file uploaded.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`;
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return "Unsupported file type. Allowed types: PDF, DOC, DOCX, PPT, PPTX, TXT, PNG, JPG, JPEG.";
  }

  return null;
};

const buildStoragePath = ({ userId, fileName, visibility = "private" }) => {
  const safeFileName = sanitizeFileName(fileName);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const folder = visibility === "public" ? "approved" : "private";
  return `notes/${folder}/${dateStamp}/${userId}/${randomSuffix}-${safeFileName}`;
};

const uploadNoteFile = async ({ userId, file, noteTitle }) => {
  if (!file) {
    throw new Error("No file uploaded.");
  }

  const validationError = validateUploadFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Supabase storage is not configured. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET.");
  }

  const client = getSupabaseClient();
  const { bucket } = getSupabaseConfig();
  const objectKey = buildStoragePath({ userId: String(userId), fileName: file.originalname || noteTitle || "note", visibility: "private" });

  const { data, error } = await client.storage.from(bucket).upload(objectKey, file.buffer, {
    contentType: file.mimetype,
    cacheControl: "3600",
    upsert: false,
    duplex: "half",
  });

  if (error) {
    throw new Error(error.message || "Supabase upload failed.");
  }

  return {
    storagePath: data?.path || objectKey,
    fileName: sanitizeFileName(file.originalname || noteTitle || "note"),
    mimeType: file.mimetype,
    fileSize: file.size,
    storageProvider: "supabase",
  };
};

const moveStorageObject = async ({ fromPath, toPath, storageProvider }) => {
  if (!fromPath || !toPath || storageProvider !== "supabase") {
    return toPath;
  }

  if (!isSupabaseConfigured()) {
    return toPath;
  }

  const client = getSupabaseClient();
  const { bucket } = getSupabaseConfig();

  const { error: moveError } = await client.storage.from(bucket).move(fromPath, toPath);
  if (moveError) {
    const { error: copyError } = await client.storage.from(bucket).copy(fromPath, toPath);
    if (copyError) {
      throw new Error(copyError.message || "Supabase storage move failed.");
    }

    const { error: removeError } = await client.storage.from(bucket).remove([fromPath]);
    if (removeError) {
      throw new Error(removeError.message || "Supabase storage cleanup failed after move.");
    }
  }

  return toPath;
};

const getSignedDownloadUrl = async ({ storagePath, storageProvider }) => {
  if (!storagePath || storageProvider !== "supabase") {
    return null;
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Supabase storage is not configured.");
  }

  const client = getSupabaseClient();
  const { bucket } = getSupabaseConfig();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);

  if (error) {
    throw new Error(error.message || "Unable to create signed download URL.");
  }

  return data?.signedUrl || null;
};

const deleteStorageObject = async ({ storagePath, storageProvider }) => {
  if (!storagePath || storageProvider !== "supabase") {
    return;
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const client = getSupabaseClient();
  const { bucket } = getSupabaseConfig();
  const { error } = await client.storage.from(bucket).remove([storagePath]);

  if (error && !String(error.message).toLowerCase().includes("not found")) {
    throw new Error(error.message || "Supabase storage cleanup failed.");
  }
};

module.exports = {
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  validateUploadFile,
  uploadNoteFile,
  moveStorageObject,
  getSignedDownloadUrl,
  deleteStorageObject,
  sanitizeFileName,
  buildStoragePath,
};

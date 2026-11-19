import type { Request } from "express";
import multer from "multer";
import type { FileFilterCallback } from "multer";
import { AppError } from "../errors/AppError.js";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(
    new AppError(
      "Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.",
      400,
      "UNSUPPORTED_FILE_TYPE",
      { received: file.mimetype, allowed: ALLOWED_MIME_TYPES },
    ),
  );
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
});
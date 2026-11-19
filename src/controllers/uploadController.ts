import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import {
  deleteImageFiles,
  processAndSaveImage,
  type ProcessedImage,
} from "../services/imageService.js";
import {
  fileIdParamSchema,
  uploadBodySchema as uploadMetadataSchema,
} from "../validators/uploadValidator.js";

const deleteQuerySchema = z.object({
  folder: uploadMetadataSchema.shape.folder,
});

export async function uploadSingle(
  req: Request,
  res: Response,
): Promise<void> {
  // Em requisições sem multipart, req.body pode ser undefined (Express 5).
  const metadata = uploadMetadataSchema.parse(req.body ?? {});

  if (!req.file) {
    throw new AppError(
      "Nenhum arquivo enviado. Use o campo 'file'.",
      400,
      "FILE_REQUIRED",
    );
  }

  const processed = await processAndSaveImage(req.file, metadata);

  res.status(201).json(processed);
}

export async function uploadMultiple(
  req: Request,
  res: Response,
): Promise<void> {
  const metadata = uploadMetadataSchema.parse(req.body ?? {});

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    throw new AppError(
      "Nenhum arquivo enviado. Use o campo 'files'.",
      400,
      "FILES_REQUIRED",
    );
  }

  const results = await Promise.allSettled(
    files.map((file) => processAndSaveImage(file, metadata)),
  );

  const processed: ProcessedImage[] = [];
  let firstFailure: unknown;
  let failed = false;

  for (const result of results) {
    if (result.status === "fulfilled") {
      processed.push(result.value);
    } else if (!failed) {
      failed = true;
      firstFailure = result.reason;
    }
  }

  // Tudo ou nada: se alguma imagem falhar, remove as que já foram salvas.
  if (failed) {
    await Promise.allSettled(
      processed.map((image) =>
        deleteImageFiles(image.id, image.folder ?? undefined),
      ),
    );
    throw firstFailure;
  }

  res.status(201).json({ count: processed.length, files: processed });
}

export async function deleteFile(req: Request, res: Response): Promise<void> {
  const { id } = fileIdParamSchema.parse(req.params);
  const { folder } = deleteQuerySchema.parse(req.query);

  await deleteImageFiles(id, folder);

  res.status(204).send();
}
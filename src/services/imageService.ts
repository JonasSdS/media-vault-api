import { randomUUID } from "node:crypto";
import { mkdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../errors/AppError.js";
import {
  fileIdParamSchema,
  uploadBodySchema,
} from "../validators/uploadValidator.js";

const WEBP_QUALITY = 80;
const MEDIUM_MAX_WIDTH = 800;
const THUMBNAIL_SIZE = 200;

const VARIANT_NAMES = ["original", "medium", "thumbnail"] as const;

export type VariantName = (typeof VARIANT_NAMES)[number];

export interface ImageVariant {
  /** Caminho relativo à raiz de uploads, sempre com "/" como separador. */
  path: string;
  /** Tamanho do arquivo em bytes. */
  size: number;
}

export interface ProcessedImage {
  id: string;
  originalName: string;
  title: string | null;
  folder: string | null;
  mimeType: "image/webp";
  variants: Record<VariantName, ImageVariant>;
  createdAt: string;
}

export interface ImageMetadata {
  folder?: string | undefined;
  title?: string | undefined;
}

export type UploadedFile = Pick<Express.Multer.File, "buffer" | "originalname">;

type SharpInstance = ReturnType<typeof sharp>;

const VARIANT_PIPELINES: Record<
  VariantName,
  (image: SharpInstance) => SharpInstance
> = {
  original: (image) => image,
  medium: (image) =>
    image.resize({ width: MEDIUM_MAX_WIDTH, withoutEnlargement: true }),
  thumbnail: (image) =>
    image.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "cover" }),
};

/**
 * Raiz de armazenamento. Lida a cada chamada para permitir sobrescrever
 * via UPLOADS_DIR (ex.: diretório temporário nos testes ou volume no Docker).
 */
function getUploadsRoot(): string {
  return path.resolve(process.env["UPLOADS_DIR"] ?? "uploads");
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function assertValidFolder(folder: string | undefined): void {
  if (folder === undefined) return;

  const result = uploadBodySchema.shape.folder.safeParse(folder);
  if (!result.success) {
    throw new AppError("Pasta inválida.", 400, "INVALID_FOLDER", {
      issues: result.error.issues.map((issue) => issue.message),
    });
  }
}

function assertValidId(id: string): void {
  if (!fileIdParamSchema.safeParse({ id }).success) {
    throw new AppError("O id deve ser um UUID válido.", 400, "INVALID_ID");
  }
}

/**
 * Resolve o diretório de destino garantindo que ele permaneça dentro da
 * raiz de uploads (defesa em profundidade contra path traversal, além do
 * regex do Zod).
 */
function resolveTargetDir(folder: string | undefined): string {
  const root = getUploadsRoot();
  const target = path.resolve(root, folder ?? "");

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new AppError("Pasta inválida.", 400, "INVALID_FOLDER");
  }

  return target;
}

function buildFileName(id: string, variant: VariantName): string {
  return `${id}-${variant}.webp`;
}

function toRelativePath(folder: string | undefined, fileName: string): string {
  return folder === undefined ? fileName : `${folder}/${fileName}`;
}

export async function processAndSaveImage(
  file: UploadedFile,
  metadata: ImageMetadata = {},
): Promise<ProcessedImage> {
  const { folder, title } = metadata;

  assertValidFolder(folder);

  const id = randomUUID();
  const targetDir = resolveTargetDir(folder);
  await mkdir(targetDir, { recursive: true });

  const absolutePaths = Object.fromEntries(
    VARIANT_NAMES.map((name) => [
      name,
      path.join(targetDir, buildFileName(id, name)),
    ]),
  ) as Record<VariantName, string>;

  // Cada variante usa sua própria instância do Sharp sobre o mesmo buffer.
  // rotate() aplica a orientação EXIF antes de a metadata ser descartada.
  const tasks = VARIANT_NAMES.map(async (name) => {
    const pipeline = VARIANT_PIPELINES[name](sharp(file.buffer).rotate());
    const info = await pipeline
      .webp({ quality: WEBP_QUALITY })
      .toFile(absolutePaths[name]);
    return [name, info.size] as const;
  });

  let sizes: ReadonlyArray<readonly [VariantName, number]>;
  try {
    sizes = await Promise.all(tasks);
  } catch (error) {
    // Espera as demais tarefas terminarem para não deixar escrita pendente
    // e remove qualquer arquivo parcial.
    await Promise.allSettled(tasks);
    await Promise.all(
      VARIANT_NAMES.map((name) => rm(absolutePaths[name], { force: true })),
    );
    throw new AppError(
      "Não foi possível processar a imagem enviada.",
      422,
      "INVALID_IMAGE",
      error instanceof Error ? { reason: error.message } : undefined,
    );
  }

  const sizeByName = new Map(sizes);
  const variants = Object.fromEntries(
    VARIANT_NAMES.map((name) => [
      name,
      {
        path: toRelativePath(folder, buildFileName(id, name)),
        size: sizeByName.get(name) ?? 0,
      },
    ]),
  ) as Record<VariantName, ImageVariant>;

  return {
    id,
    originalName: file.originalname,
    title: title ?? null,
    folder: folder ?? null,
    mimeType: "image/webp",
    variants,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Remove as 3 variantes de uma imagem. Lança AppError 404 se nenhuma delas
 * existir; se apenas algumas existirem (estado inconsistente), remove as
 * que restam.
 */
export async function deleteImageFiles(
  id: string,
  folder?: string,
): Promise<void> {
  assertValidId(id);
  assertValidFolder(folder);

  const targetDir = resolveTargetDir(folder);

  const results = await Promise.allSettled(
    VARIANT_NAMES.map((name) =>
      unlink(path.join(targetDir, buildFileName(id, name))),
    ),
  );

  let missing = 0;
  for (const result of results) {
    if (result.status === "fulfilled") continue;

    if (isErrnoException(result.reason) && result.reason.code === "ENOENT") {
      missing += 1;
      continue;
    }
    throw result.reason;
  }

  if (missing === VARIANT_NAMES.length) {
    throw new AppError("Imagem não encontrada.", 404, "IMAGE_NOT_FOUND", {
      id,
    });
  }
}
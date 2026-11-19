import { access, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../src/errors/AppError.js";
import {
  deleteImageFiles,
  processAndSaveImage,
} from "../../src/services/imageService.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let tempRoot: string;
let previousUploadsDir: string | undefined;

async function createImageBuffer(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  previousUploadsDir = process.env["UPLOADS_DIR"];
  tempRoot = await mkdtemp(path.join(tmpdir(), "mediavault-test-"));
  process.env["UPLOADS_DIR"] = tempRoot;
});

afterAll(async () => {
  if (previousUploadsDir === undefined) {
    delete process.env["UPLOADS_DIR"];
  } else {
    process.env["UPLOADS_DIR"] = previousUploadsDir;
  }
  await rm(tempRoot, { recursive: true, force: true });
});

describe("processAndSaveImage", () => {
  it("gera as 3 variantes .webp com as dimensões esperadas", async () => {
    const buffer = await createImageBuffer(1600, 1200);

    const result = await processAndSaveImage(
      { buffer, originalname: "foto.png" },
      { title: "Minha foto" },
    );

    expect(result.id).toMatch(UUID_REGEX);
    expect(result.originalName).toBe("foto.png");
    expect(result.title).toBe("Minha foto");
    expect(result.folder).toBeNull();
    expect(result.mimeType).toBe("image/webp");
    expect(new Date(result.createdAt).toString()).not.toBe("Invalid Date");

    expect(result.variants.original.path).toBe(`${result.id}-original.webp`);
    expect(result.variants.medium.path).toBe(`${result.id}-medium.webp`);
    expect(result.variants.thumbnail.path).toBe(`${result.id}-thumbnail.webp`);

    const expectedDimensions = {
      original: { width: 1600, height: 1200 },
      medium: { width: 800, height: 600 },
      thumbnail: { width: 200, height: 200 },
    } as const;

    for (const name of ["original", "medium", "thumbnail"] as const) {
      const variant = result.variants[name];
      const absolutePath = path.join(tempRoot, variant.path);
      const metadata = await sharp(absolutePath).metadata();
      const { size } = await stat(absolutePath);

      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(expectedDimensions[name].width);
      expect(metadata.height).toBe(expectedDimensions[name].height);
      expect(variant.size).toBe(size);
      expect(variant.size).toBeGreaterThan(0);
    }
  });

  it("não amplia imagens menores que 800px na variante medium", async () => {
    const buffer = await createImageBuffer(100, 80);

    const result = await processAndSaveImage(
      { buffer, originalname: "pequena.png" },
      { folder: "small" },
    );

    const medium = await sharp(
      path.join(tempRoot, result.variants.medium.path),
    ).metadata();
    const thumbnail = await sharp(
      path.join(tempRoot, result.variants.thumbnail.path),
    ).metadata();

    expect(medium.width).toBe(100);
    expect(medium.height).toBe(80);
    expect(thumbnail.width).toBe(200);
    expect(thumbnail.height).toBe(200);
  });

  it("salva dentro da pasta informada e a retorna nos caminhos relativos", async () => {
    const buffer = await createImageBuffer(300, 300);

    const result = await processAndSaveImage(
      { buffer, originalname: "a.png" },
      { folder: "avatars" },
    );

    expect(result.folder).toBe("avatars");
    expect(result.variants.original.path).toBe(
      `avatars/${result.id}-original.webp`,
    );
    expect(
      await exists(path.join(tempRoot, "avatars", `${result.id}-medium.webp`)),
    ).toBe(true);
  });

  it("gera ids únicos a cada chamada", async () => {
    const buffer = await createImageBuffer(50, 50);

    const [a, b] = await Promise.all([
      processAndSaveImage({ buffer, originalname: "a.png" }),
      processAndSaveImage({ buffer, originalname: "b.png" }),
    ]);

    expect(a.id).not.toBe(b.id);
  });

  it("bloqueia path traversal no folder", async () => {
    const buffer = await createImageBuffer(50, 50);

    await expect(
      processAndSaveImage(
        { buffer, originalname: "x.png" },
        { folder: "../evil" },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_FOLDER" });

    expect(await exists(path.join(tempRoot, "..", "evil"))).toBe(false);
  });

  it("lança AppError 422 e não deixa arquivos para trás com buffer inválido", async () => {
    const promise = processAndSaveImage(
      { buffer: Buffer.from("isto não é uma imagem"), originalname: "x.png" },
      { folder: "invalid-case" },
    );

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_IMAGE",
    });

    expect(await readdir(path.join(tempRoot, "invalid-case"))).toEqual([]);
  });
});

describe("deleteImageFiles", () => {
  it("remove as 3 variantes do disco", async () => {
    const buffer = await createImageBuffer(400, 400);
    const result = await processAndSaveImage(
      { buffer, originalname: "del.png" },
      { folder: "to-delete" },
    );

    await deleteImageFiles(result.id, "to-delete");

    for (const variant of Object.values(result.variants)) {
      expect(await exists(path.join(tempRoot, variant.path))).toBe(false);
    }
  });

  it("remove variantes sem pasta (raiz de uploads)", async () => {
    const buffer = await createImageBuffer(400, 400);
    const result = await processAndSaveImage({
      buffer,
      originalname: "root.png",
    });

    await deleteImageFiles(result.id);

    expect(await exists(path.join(tempRoot, result.variants.original.path))).toBe(
      false,
    );
  });

  it("lança AppError 404 quando a imagem não existe", async () => {
    const promise = deleteImageFiles("3f2b8c1e-5a4d-4e8f-9c3b-1a2b3c4d5e6f");

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 404,
      code: "IMAGE_NOT_FOUND",
    });
  });

  it("lança 404 ao excluir duas vezes a mesma imagem", async () => {
    const buffer = await createImageBuffer(100, 100);
    const result = await processAndSaveImage({
      buffer,
      originalname: "twice.png",
    });

    await deleteImageFiles(result.id);

    await expect(deleteImageFiles(result.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejeita ids inválidos (evita path traversal via id)", async () => {
    await expect(deleteImageFiles("../../etc/passwd")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_ID",
    });
  });
});
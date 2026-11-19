import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let app: Parameters<typeof request>[0];
let uploadsDir: string;

async function createImageBuffer(
  width = 1000,
  height = 800,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
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
  uploadsDir = await mkdtemp(path.join(tmpdir(), "mediavault-it-"));
  process.env["UPLOADS_DIR"] = uploadsDir;

  const mod = await import("../../src/app.js");
  app = mod.app;
});

afterAll(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  delete process.env["UPLOADS_DIR"];
});

describe("POST /v1/files/single", () => {
  it("retorna 201 com metadados e variantes para uma imagem válida", async () => {
    const buffer = await createImageBuffer();

    const res = await request(app)
      .post("/v1/files/single")
      .field("title", "Minha foto")
      .field("folder", "gallery")
      .attach("file", buffer, { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      originalName: "foto.png",
      title: "Minha foto",
      folder: "gallery",
      mimeType: "image/webp",
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(Object.keys(res.body.variants).sort()).toEqual([
      "medium",
      "original",
      "thumbnail",
    ]);

    for (const variant of Object.values<{ path: string; size: number }>(
      res.body.variants,
    )) {
      expect(variant.size).toBeGreaterThan(0);
      expect(await exists(path.join(uploadsDir, variant.path))).toBe(true);
    }
  });

  it("serve os arquivos gerados em /uploads", async () => {
    const buffer = await createImageBuffer();
    const upload = await request(app)
      .post("/v1/files/single")
      .attach("file", buffer, { filename: "foto.png", contentType: "image/png" });

    const res = await request(app).get(`/uploads/${upload.body.variants.thumbnail.path}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
  });

  it("retorna 400 quando nenhum arquivo é enviado", async () => {
    const res = await request(app).post("/v1/files/single");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILE_REQUIRED");
  });

  it("retorna 400 para formato inválido (.txt)", async () => {
    const res = await request(app)
      .post("/v1/files/single")
      .attach("file", Buffer.from("isto não é uma imagem"), {
        filename: "nota.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

describe("POST /v1/files/multiple", () => {
  it("retorna 201 ao enviar 2 imagens", async () => {
    const [a, b] = await Promise.all([
      createImageBuffer(1200, 900),
      createImageBuffer(600, 600),
    ]);

    const res = await request(app)
      .post("/v1/files/multiple")
      .attach("files", a, { filename: "a.png", contentType: "image/png" })
      .attach("files", b, { filename: "b.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files[0].id).not.toBe(res.body.files[1].id);
  });

  it("retorna 400 quando nenhum arquivo é enviado", async () => {
    const res = await request(app).post("/v1/files/multiple");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILES_REQUIRED");
  });
});

describe("DELETE /v1/files/:id", () => {
  it("retorna 204 ao deletar uma imagem recém-enviada", async () => {
    const buffer = await createImageBuffer();
    const upload = await request(app)
      .post("/v1/files/single")
      .attach("file", buffer, { filename: "foto.png", contentType: "image/png" });

    const res = await request(app).delete(`/v1/files/${upload.body.id}`);

    expect(res.status).toBe(204);
    for (const variant of Object.values<{ path: string }>(
      upload.body.variants,
    )) {
      expect(await exists(path.join(uploadsDir, variant.path))).toBe(false);
    }
  });

  it("retorna 204 ao deletar uma imagem dentro de uma pasta (?folder=)", async () => {
    const buffer = await createImageBuffer();
    const upload = await request(app)
      .post("/v1/files/single")
      .field("folder", "albums")
      .attach("file", buffer, { filename: "foto.png", contentType: "image/png" });

    const res = await request(app)
      .delete(`/v1/files/${upload.body.id}`)
      .query({ folder: "albums" });

    expect(res.status).toBe(204);
  });

  it("retorna 400 com UUID inválido", async () => {
    const res = await request(app).delete("/v1/files/nao-e-um-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("retorna 404 com UUID inexistente", async () => {
    const res = await request(app).delete(`/v1/files/${randomUUID()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("IMAGE_NOT_FOUND");
  });
});
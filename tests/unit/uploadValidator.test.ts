import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fileIdParamSchema,
  uploadBodySchema,
} from "../../src/validators/uploadValidator.js";

describe("uploadBodySchema", () => {
  it("aceita payload vazio", () => {
    const result = uploadBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita title e folder válidos", () => {
    const result = uploadBodySchema.safeParse({
      title: "Minha foto",
      folder: "viagens_2026-verao",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.folder).toBe("viagens_2026-verao");
    }
  });

  it("aceita título com exatamente 100 caracteres", () => {
    const result = uploadBodySchema.safeParse({ title: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("remove espaços nas pontas do título", () => {
    const result = uploadBodySchema.safeParse({ title: "  foto  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("foto");
    }
  });

  it("rejeita título com mais de 100 caracteres", () => {
    const result = uploadBodySchema.safeParse({ title: "a".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["title"]);
    }
  });

  it.each(["minha pasta", "pasta/sub", "../etc", "pasta.jpg", "pásta", ""])(
    "rejeita folder com caracteres inválidos: %j",
    (folder) => {
      const result = uploadBodySchema.safeParse({ folder });
      expect(result.success).toBe(false);
    },
  );

  it("rejeita folder com mais de 50 caracteres", () => {
    const result = uploadBodySchema.safeParse({ folder: "a".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("rejeita title que não seja string", () => {
    const result = uploadBodySchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });
});

describe("fileIdParamSchema", () => {
  it("aceita um UUID válido", () => {
    const id = randomUUID();
    const result = fileIdParamSchema.safeParse({ id });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(id);
    }
  });

  it.each(["abc", "123", "not-a-uuid", "", "550e8400-e29b-41d4-a716"])(
    "rejeita id inválido: %j",
    (id) => {
      const result = fileIdParamSchema.safeParse({ id });
      expect(result.success).toBe(false);
    },
  );

  it("rejeita quando o id está ausente", () => {
    const result = fileIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
import { z } from "zod";

export const uploadBodySchema = z.object({
  title: z
    .string()
    .trim()
    .max(100, "O título deve ter no máximo 100 caracteres.")
    .optional(),
  folder: z
    .string()
    .max(50, "A pasta deve ter no máximo 50 caracteres.")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "A pasta deve conter apenas letras, números, hífen e underline.",
    )
    .optional(),
});

export const fileIdParamSchema = z.object({
  id: z.uuid("O id deve ser um UUID válido."),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type FileIdParam = z.infer<typeof fileIdParamSchema>;
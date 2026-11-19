import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "O arquivo excede o tamanho máximo permitido.",
  LIMIT_FILE_COUNT: "Quantidade de arquivos acima do permitido.",
  LIMIT_UNEXPECTED_FILE: "Campo de arquivo inesperado.",
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  // Erros de domínio da aplicação
  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Erros de validação (Zod)
  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        details: err.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  // Erros de upload (Multer)
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: MULTER_MESSAGES[err.code] ?? err.message,
      },
    };
    res.status(status).json(body);
    return;
  }

  // Erros com status HTTP próprio (ex.: JSON malformado no express.json)
  const status: unknown = err?.status ?? err?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const isInvalidJson = err.type === "entity.parse.failed";
    const body: ErrorBody = {
      error: {
        code: isInvalidJson ? "INVALID_JSON" : "BAD_REQUEST",
        message: isInvalidJson
          ? "JSON inválido no corpo da requisição."
          : "Requisição inválida.",
      },
    };
    res.status(status).json(body);
    return;
  }

  // Qualquer outro erro: não vazar detalhes internos
  console.error(err);
  const body: ErrorBody = {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Erro interno do servidor.",
    },
  };
  res.status(500).json(body);
};
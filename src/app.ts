import path from "node:path";
import { uploadRoutes } from "./routes/uploadRoutes.js";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/uploads", express.static(path.resolve(process.env["UPLOADS_DIR"] ?? "uploads")));
app.use("/v1/files", uploadRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Rota não encontrada." },
  });
});

app.use(errorHandler);

export default app;
import { Router } from "express";
import { upload as uploadConfig } from "../config/multer.js";
import {
  deleteFile,
  uploadMultiple,
  uploadSingle,
} from "../controllers/uploadController.js";

export const uploadRoutes = Router();

uploadRoutes.post("/single", uploadConfig.single("file"), uploadSingle);
uploadRoutes.post("/multiple", uploadConfig.array("files", 10), uploadMultiple);
uploadRoutes.delete("/:id", deleteFile);
import multer from "multer";
import { Request } from "express";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/pdf",
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Only PNG, JPEG, JPG, and PDF are allowed."));
    }
  },
});
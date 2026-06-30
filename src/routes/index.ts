import { Router } from "express";
import userRoutes from "./users";
import authRoutes from "./auth";          

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);          
router.use("/users", userRoutes);

export default router;
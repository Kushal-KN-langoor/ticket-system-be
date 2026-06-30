import { Router } from "express";
import userRoutes from "./users";
import authRoutes from "./auth";
import projectRoutes from "./project";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/projects", projectRoutes);

export default router;
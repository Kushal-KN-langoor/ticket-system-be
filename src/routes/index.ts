import { Router } from "express";
import userRoutes from "./users";
import authRoutes from "./auth";
import projectRoutes from "./project";
import ticketRoutes from "./tickets";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/projects", projectRoutes);
router.use("/tickets", ticketRoutes);

export default router;
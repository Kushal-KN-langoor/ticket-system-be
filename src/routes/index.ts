import { Router } from "express";
import userRoutes from "./users";
import authRoutes from "./auth";
import ticketRoutes from "./tickets";
import projectRoutes from "./project";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/tickets", ticketRoutes);
router.use("/project", projectRoutes);
export default router;
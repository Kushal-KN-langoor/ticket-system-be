import { Router } from "express";
import userRoutes from "./users";
import authRoutes from "./auth";
import projectRoutes from "./project";
import ticketRoutes from "./tickets";
import attachmentRoutes from "./attachments";
import summaryRoutes from "./summary";
const router = Router();

router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/project", projectRoutes);
router.use("/tickets", ticketRoutes);
router.use("/attachments", attachmentRoutes);
router.use("/summary", summaryRoutes);


export default router;
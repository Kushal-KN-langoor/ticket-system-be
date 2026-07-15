import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/summary/:projectId — stats for the Summary tab
router.get("/:projectId", authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user?.id;

    const project = await prisma.projects.findUnique({
      where: { id: projectId as string },
      select: { id: true, user_id: true, super_admin_id: true },
    });

    if (!project) {
      return res.status(404).json({ status: "404", message: "Project not found" });
    }

    const isMember = await prisma.project_members.findFirst({
      where: { project_id: projectId as string, user_id: userId } as any,
    });
    const isOwner = project.user_id === userId || project.super_admin_id === userId;

    if (!isMember && !isOwner) {
      return res.status(403).json({ status: "403", message: "Not a member of this project" });
    }

    const tickets = await prisma.tickets.findMany({
      where: { project_id: projectId as string },
      select: { id: true, status: true, created_at: true },
    });

    const total = tickets.length;

    const resolved = tickets.filter((t) => t.status === "Done").length;

    const inProgress = tickets.filter((t) => t.status === "In Progress").length;

    const open = tickets.filter(
      (t) =>
        t.status === "To Do" ||
        t.status === "Backlog" ||
        t.status === "Blocked" ||
        t.status === "Ready for QA"
    ).length;

    // Trend: tickets created per day, last 7 days
    const today = new Date();
    const trend: { day: string; tickets: number }[] = [];

    for (let i = 0; i <= 6; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      const count = tickets.filter((t) => {
        if (!t.created_at) return false;
        const createdAt = new Date(t.created_at);
        return createdAt >= dayStart && createdAt <= dayEnd;
      }).length;

      trend.push({
        day: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
        tickets: count,
      });
    }

    // Fixed calendar-week order: Monday -> Sunday, regardless of what day "today" is.
    // Since the loop above covers exactly the last 7 days, each weekday appears exactly once,
    // so sorting by this fixed order is safe.
    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    trend.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

    res.json({
      status: "200",
      data: { total, open, inProgress, resolved, trend },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Failed to fetch summary", detail: error.message });
  }
});

export default router;
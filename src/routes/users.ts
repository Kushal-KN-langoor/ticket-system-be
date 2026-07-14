import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { DEPARTMENTS } from "../constants/departments";

const router = Router();

const ALLOWED_ROLES = ["SuperAdmin", "Admin", "Editor", "User"];

router.get("/", authenticate, async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true, department: true, created_at: true },
    });
    res.json({ status: "200", total: users.length, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Error fetching users" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ status: "404", message: "User not found" });

    const { password_hash, ...safeUser } = user;
    res.json({ status: "200", user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Error fetching user" });
  }
});

// GET /api/users/:id/dashboard — projects + assigned tickets + status counts
router.get("/:id/dashboard", authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [memberships, tickets] = await Promise.all([
      prisma.project_members.findMany({
        where: { user_id: id as string },
        include: { projects: true },
      }),
      prisma.tickets.findMany({
        where: { assigned_to: id as string },
        include: {
          projects: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const projects = memberships.map((m) => m.projects);

    const ticketCounts: Record<string, number> = {};
    for (const t of tickets) {
      const key = t.status ?? "Unknown";
      ticketCounts[key] = (ticketCounts[key] || 0) + 1;
    }

    res.json({
      status: "200",
      projects,
      tickets,
      ticket_counts: ticketCounts,
      total_projects: projects.length,
      total_tickets: tickets.length,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Failed to fetch dashboard", detail: error.message });
  }
});

// GET /api/users/:id/projects — projects this user is a member of
router.get("/:id/projects", authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const memberships = await prisma.project_members.findMany({
      where: { user_id: id as string },
      include: { projects: true },
    });

    const projects = memberships.map((m) => m.projects);
    res.json({ status: "200", total: projects.length, projects });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Failed to fetch projects", detail: error.message });
  }
});

// PATCH /api/users/:id/role — SuperAdmin only. Global role change.
router.patch("/:id/role", authenticate, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ status: "400", message: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
    }

    const targetUser = await prisma.users.findUnique({ where: { id: id as string } });
    if (!targetUser) return res.status(404).json({ status: "404", message: "User not found" });

    const updated = await prisma.users.update({
      where: { id: id as string },
      data: { role },
      select: { id: true, name: true, email: true, role: true, created_at: true },
    });

    res.json({ status: "200", message: "User role updated successfully", user: updated });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Failed to update role", detail: error.message });
  }
});

// PATCH /api/users/:id/department — Admin or SuperAdmin only
router.patch("/:id/department", authenticate, requireRole(["SuperAdmin", "Admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { department } = req.body;

    if (!department || !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ status: "400", message: `department must be one of: ${DEPARTMENTS.join(", ")}` });
    }

    const targetUser = await prisma.users.findUnique({ where: { id: id as string } });
    if (!targetUser) return res.status(404).json({ status: "404", message: "User not found" });

    const updated = await prisma.users.update({
      where: { id: id as string },
      data: { department },
      select: { id: true, name: true, email: true, role: true, department: true, created_at: true },
    });

    res.json({ status: "200", message: "User department updated successfully", user: updated });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Failed to update department", detail: error.message });
  }
});

export default router;
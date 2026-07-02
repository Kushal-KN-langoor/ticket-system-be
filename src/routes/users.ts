import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const ALLOWED_ROLES = ["SuperAdmin", "Admin", "Editor", "User"];

router.get("/", authenticate, async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true, created_at: true },
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

export default router;
import { Router } from "express";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

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

export default router;

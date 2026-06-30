import { Router } from "express";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";   // ADD THIS

const router = Router();

router.get("/", async (req, res) => {
  try {
    const users = await prisma.users.findMany();
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// ADD THIS WHOLE BLOCK
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user" });
  }
});

export default router;
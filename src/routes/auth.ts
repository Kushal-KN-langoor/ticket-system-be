import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

const router = Router();

const ALLOWED_ROLES = ["Admin", "Editor", "User"];
const DEFAULT_ROLE = "User";

function signToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "1h") as any }
  );
}

function toSafeUser(user: any) {
  const { password_hash, ...safe } = user;
  return safe;
}

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const finalRole = role && ALLOWED_ROLES.includes(role) ? role : DEFAULT_ROLE;
    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await prisma.users.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.users.create({
      data: { name, email: normalizedEmail, password_hash, role: finalRole },
    });

    const token = signToken(user);
    res.status(201).json({ token, user: toSafeUser(user) });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    console.error(error);
    res.status(500).json({ message: "Error creating user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await prisma.users.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = signToken(user);
    res.json({ token, user: toSafeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging in" });
  }
});

export default router;                    
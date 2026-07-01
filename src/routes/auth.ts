import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../lib/prisma";

const router = Router();

const ALLOWED_ROLES = ["Admin", "Editor", "User"];
const DEFAULT_ROLE = "User";
const REFRESH_TOKEN_HOURS = Number(process.env.REFRESH_TOKEN_EXPIRES_HOURS || 2);

function signAccessToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN || "15m") as any }
  );
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getErrorDetail(error: any) {
  return error?.message?.split("\n").pop() ?? String(error);
}

async function issueRefreshToken(userId: string) {
  const rawToken = crypto.randomBytes(40).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_HOURS * 60 * 60 * 1000);
  await prisma.refresh_tokens.create({
    data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt },
  });
  return rawToken;
}

function toSafeUser(user: any) {
  const { password_hash, ...safe } = user;
  return safe;
}

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ status: "400", message: "name, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ status: "400", message: "Password must be at least 8 characters" });
    }
    const finalRole = role && ALLOWED_ROLES.includes(role) ? role : DEFAULT_ROLE;
    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await prisma.users.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ status: "409", message: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.users.create({
      data: { name, email: normalizedEmail, password_hash, role: finalRole },
    });

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    res.status(201).json({ status: "201", message: "Account created successfully", accessToken, refreshToken, user: toSafeUser(user) });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({ status: "409", message: "An account with this email already exists" });
    }
    console.error(error);
    res.status(500).json({ status: "500", message: "Error creating user", detail: getErrorDetail(error) });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: "400", message: "email and password are required" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await prisma.users.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ status: "401", message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ status: "401", message: "Invalid email or password" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    res.json({ status: "200", message: "Login successful", accessToken, refreshToken, user: toSafeUser(user) });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Error logging in", detail: getErrorDetail(error) });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.headers["x-refresh-token"] as string | undefined;
    if (!refreshToken) {
      return res.status(401).json({ status: "401", message: "No refresh token provided" });
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refresh_tokens.findUnique({ where: { token_hash: tokenHash } });

    if (!stored || stored.expires_at < new Date()) {
      return res.status(401).json({ status: "401", message: "Invalid or expired refresh token" });
    }

    const user = await prisma.users.findUnique({ where: { id: stored.user_id } });
    if (!user) {
      return res.status(401).json({ status: "401", message: "User no longer exists" });
    }

    await prisma.refresh_tokens.delete({ where: { id: stored.id } });

    const accessToken = signAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);

    res.json({ status: "200", message: "Token refreshed successfully", accessToken, refreshToken: newRefreshToken });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Error refreshing token", detail: getErrorDetail(error) });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.headers["x-refresh-token"] as string | undefined;
    if (!refreshToken) {
      return res.status(400).json({ status: "400", message: "No refresh token provided" });
    }

    const tokenHash = hashToken(refreshToken);
    await prisma.refresh_tokens.deleteMany({ where: { token_hash: tokenHash } });

    res.json({ status: "200", message: "Logged out successfully" });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: "500", message: "Error logging out", detail: getErrorDetail(error) });
  }
});

export default router;
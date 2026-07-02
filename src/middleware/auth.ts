import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

// role type kept local to this file, no extra file needed
const ALLOWED_ROLES = ["Admin", "Editor", "User", "SuperAdmin"] as const;
export type Role = (typeof ALLOWED_ROLES)[number];

export interface AuthPayload {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.header("x-auth-token");

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(roles: readonly Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
}

// Only lets through the user who is the super admin of the :projectId in the route.
// Must be used after `authenticate`, and only on routes that have a :projectId param.
export async function requireProjectSuperAdmin(
  req: Request<{ projectId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ status: "401", message: "Unauthorized" });
      return;
    }

    const project = await prisma.projects.findUnique({ where: { id: projectId } });

    if (!project) {
      res.status(404).json({ status: "404", message: "Project not found" });
      return;
    }

    if (project.super_admin_id !== userId) {
      res.status(403).json({ status: "403", message: "Only the project super admin can do this" });
      return;
    }

    next();
  } catch (error) {
    console.error("requireProjectSuperAdmin error:", error);
    res.status(500).json({ status: "500", message: "Internal server error" });
  }
}
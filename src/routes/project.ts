import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { authenticate, requireRole, requireProjectSuperAdmin } from "../middleware/auth";
import { DEPARTMENTS } from "../constants/departments";

const router = Router();

router.get("/status", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    module: "project creation",
  });
});
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      const projects = await prisma.projects.findMany({
        where: {
          OR: [
            { user_id: userId },
            { super_admin_id: userId },
            {
              project_members: {
                some: {
                  user_id: userId,
                },
              },
            },
          ],
        },
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      res.status(200).json({
        status: "200",
        total: projects.length,
        projects,
      });
    } catch (error) {
      console.error("Get projects error:", error);
      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);
type AddMemberBody = {
  members: {
    user_id?: string;
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  }[];
};

//Only Admin can create projects
router.post(
  "/",
  authenticate,
  requireRole(["Admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, department } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          message: "Unauthorized",
        });
        return;
      }

      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({
          message: "Project name is required",
        });
        return;
      }

      if (!department || !DEPARTMENTS.includes(department)) {
        res.status(400).json({
          message: `department is required and must be one of: ${DEPARTMENTS.join(", ")}`,
        });
        return;
      }

      const project = await prisma.projects.create({
        data: {
          name: name.trim(),
          description:
            typeof description === "string"
              ? description.trim()
              : null,
          department,

          users: {
            connect: {
              id: userId,
            },
          },

          project_members: {
            create: {
              users: {
                connect: {
                  id: userId,
                },
              },
            },
          },
        },

        include: {
          project_members: {
            select: {
              user_id: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      console.error("Create project error:", error);
      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// PATCH /api/projects/:projectId/super-admin — only the current super admin can hand it off
router.patch(
  "/:projectId/super-admin",
  authenticate,
  requireProjectSuperAdmin,
  async (req: Request<{ projectId: string }>, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;
      const { user_id } = req.body;

      if (!user_id || typeof user_id !== "string") {
        res.status(400).json({ status: "400", message: "user_id is required" }); return;
      }

      const isMember = await prisma.project_members.findFirst({
        where: { project_id: projectId, user_id },
      });
      if (!isMember) {
        res.status(400).json({ status: "400", message: "User must be a member of this project" }); return;
      }

      const updated = await prisma.projects.update({
        where: { id: projectId },
        data: { super_admin_id: user_id },
      });

      res.json({ status: "200", message: "Super admin updated successfully", project: updated });
    } catch (error) {
      console.error("Update super admin error:", error);
      res.status(500).json({ status: "500", message: "Internal server error" });
    }
  }
);

// GET /api/projects/:projectId/members — get all members for assignee dropdown
router.get("/:projectId/members", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.projects.findUnique({ where: { id: projectId as string } });
    if (!project) { res.status(404).json({ status: "404", message: "Project not found" }); return; }

    const members = await prisma.project_members.findMany({
      where: { project_id: projectId as string },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, department: true } },
      },
    });

    const users = members.map((m) => m.users);
    res.json({ status: "200", total: users.length, members: users });
  } catch (error) {
    console.error("Get members error:", error);
    res.status(500).json({ status: "500", message: "Internal server error" });
  }
});

// POST /api/projects/:projectId/members — add members
router.post(
  "/:projectId/members",
  authenticate,
  async (
    req: Request<{ projectId: string }, unknown, AddMemberBody>,
    res: Response
  ): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      const { members } = req.body;
      const loggedInUserId = req.user?.id;

      if (!loggedInUserId) {
        res.status(401).json({
          status: "401",
          message: "Unauthorized",
        });
        return;
      }

      if (!projectId) {
        res.status(400).json({
          status: "400",
          message: "Project id is required",
        });
        return;
      }

      if (!Array.isArray(members) || members.length === 0) {
        res.status(400).json({
          status: "400",
          message: "members array is required",
        });
        return;
      }

      const project = await prisma.projects.findFirst({
        where: {
          id: projectId,
        },
      });

      if (!project) {
        res.status(404).json({
          status: "404",
          message: "Project not found",
        });
        return;
      }

      if (project.user_id !== loggedInUserId) {
        res.status(403).json({
          status: "403",
          message: "Only project owner can add members",
        });
        return;
      }

      const addedMembers: { user_id: string }[] = [];

      for (const member of members) {
        const email =
          typeof member.email === "string"
            ? member.email.toLowerCase().trim()
            : undefined;

        const memberUserId =
          typeof member.user_id === "string"
            ? member.user_id
            : undefined;

        if (!memberUserId && !email) {
          res.status(400).json({
            status: "400",
            message: "Each member must have user_id or email",
          });
          return;
        }

        let user = null;

        // Find existing user by user_id
        if (memberUserId) {
          user = await prisma.users.findUnique({
            where: {
              id: memberUserId,
            },
          });

          if (!user) {
            res.status(404).json({
              status: "404",
              message: `User not found: ${memberUserId}`,
            });
            return;
          }
        }

        // Find existing user by email
        if (!user && email) {
          user = await prisma.users.findUnique({
            where: {
              email,
            },
          });
        }

        // Create new user if not found
        if (!user) {
          if (!email || !member.name || !member.password) {
            res.status(400).json({
              message: "New user requires name, email and password",
            });
            return;
          }

          if (member.password.length < 8) {
            res.status(400).json({
              message: "Password must be at least 8 characters",
            });
            return;
          }

          const password_hash = await bcrypt.hash(member.password, 10);

          user = await prisma.users.create({
            data: {
              name: member.name,
              email,
              password_hash,
              role: member.role || "User",
            },
          });
        }

        // Check if already a member
        const existingMember = await prisma.project_members.findFirst({
          where: {
            projects: {
              id: projectId,
            },
            users: {
              id: user.id,
            },
          },
        });

        // Add member if not already present
        if (!existingMember) {
          const projectMember = await prisma.project_members.create({
            data: {
              projects: {
                connect: {
                  id: projectId,
                },
              },
              users: {
                connect: {
                  id: user.id,
                },
              },
            },
            select: {
              user_id: true,
            },
          });

          addedMembers.push(projectMember);
        }
      }

      res.status(201).json({
        status: "201",
        message: "Members added successfully",
        members: addedMembers,
      });
    } catch (error) {
      console.error("Add project members error:", error);
      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);

export default router;
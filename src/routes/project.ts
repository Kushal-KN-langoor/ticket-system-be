import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

type AddMemberBody = {
  members: {
    user_id?: string;
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  }[];
};

router.post("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "Project name is required" });
      return;
    }

    const project = await prisma.projects.create({
      data: {
        name: name.trim(),
        description: typeof description === "string" ? description.trim() : null,
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
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/:projectId/members",
  authenticate,
  async (req: Request<{ projectId: string }, unknown, AddMemberBody>, res: Response): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      const { members } = req.body;
      const loggedInUserId = req.user?.id;

      if (!loggedInUserId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!projectId) {
        res.status(400).json({ message: "Project id is required" });
        return;
      }

      if (!Array.isArray(members) || members.length === 0) {
        res.status(400).json({ message: "members array is required" });
        return;
      }

      const project = await prisma.projects.findFirst({
        where: {
          id: projectId,
        },
      });

      if (!project) {
        res.status(404).json({ message: "Project not found" });
        return;
      }

      if (project.user_id !== loggedInUserId) {
        res.status(403).json({ message: "Only project owner can add members" });
        return;
      }

      const addedMembers: { user_id: string }[] = [];

      for (const member of members) {
        const email =
          typeof member.email === "string"
            ? member.email.toLowerCase().trim()
            : undefined;

        const memberUserId =
          typeof member.user_id === "string" ? member.user_id : undefined;

        if (!memberUserId && !email) {
          res.status(400).json({ message: "Each member must have user_id or email" });
          return;
        }

        let user = null;

        if (memberUserId) {
          user = await prisma.users.findUnique({
            where: {
              id: memberUserId,
            },
          });

          if (!user) {
            res.status(404).json({ message: `User not found: ${memberUserId}` });
            return;
          }
        }

        if (!user && email) {
          user = await prisma.users.findUnique({
            where: {
              email,
            },
          });
        }

        if (!user) {
          if (!email || !member.name || !member.password) {
            res.status(400).json({
              message: "New user requires name, email and password",
            });
            return;
          }

          if (member.password.length < 8) {
            res.status(400).json({ message: "Password must be at least 8 characters" });
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
        message: "Members added successfully",
        members: addedMembers,
      });
    } catch (error) {
      console.error("Add project members error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
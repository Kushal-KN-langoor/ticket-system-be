import { Router } from "express";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        status: "401",
      });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Project name is required",
        status: "400",
      });
    }

    if (description && typeof description !== "string") {
      return res.status(400).json({
        message: "Project description must be text",
        status: "400",
      });
    }

    const project = await prisma.projects.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        user_id: userId,
        project_members: {
          create: {
            user_id: userId,
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

    return res.status(201).json({
      message: "Project created successfully",
      status: "201",
      project,
    });
  } catch (error) {
    console.error("Create project error:", error);

    return res.status(500).json({
      message: "Internal server error",
      status: "500",
    });
  }
});

export default router;
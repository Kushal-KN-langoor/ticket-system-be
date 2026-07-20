import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

/**
 * GET - Get all statuses of a project
 */
router.get(
  "/:projectId",
  authenticate,
  async (req: Request<{ projectId: string }>, res: Response) => {
    try {
      const { projectId } = req.params;

      const statuses = await prisma.statuses.findMany({
        where: {
          project_id: projectId,
        },
        orderBy: {
          position: "asc",
        },
      });

      res.status(200).json({
        status: "200",
        statuses,
      });
    } catch (error) {
      console.error("Get statuses error:", error);

      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);

/**
 * POST - Create new status
 */
router.post(
  "/:projectId",
  authenticate,
  async (req: Request<{ projectId: string }>, res: Response) => {
    try {
      const { projectId } = req.params;
      console.log("Headers:", req.headers);
      console.log("Body:", req.body);

      const { name, color } = req.body || {};

      if (!name || !name.trim()) {
        return res.status(400).json({
          status: "400",
          message: "Status name is required",
        });
      }

      const lastStatus = await prisma.statuses.findFirst({
        where: {
          project_id: projectId,
        },
        orderBy: {
          position: "desc",
        },
      });

      const newStatus = await prisma.statuses.create({
        data: {
          project_id: projectId,
          name: name.trim(),
          color: color || "#808080",
          position: lastStatus ? lastStatus.position + 1 : 0,
        },
      });

      res.status(201).json({
        status: "201",
        message: "Status created successfully",
        statusData: newStatus,
      });
    } catch (error: any) {
      console.error("Create status error:", error);

      if (error.code === "P2002") {
        return res.status(409).json({
          status: "409",
          message: "Status already exists",
        });
      }

      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);

/**
 * PATCH - Rename status
 */
router.patch(
  "/:statusId",
  authenticate,
  async (req: Request<{ statusId: string }>, res: Response) => {
    try {
      const { statusId } = req.params;
      const { name, color } = req.body;

      const updatedStatus = await prisma.statuses.update({
        where: {
          id: statusId,
        },
        data: {
          ...(name && { name: name.trim() }),
          ...(color && { color }),
        },
      });

      res.status(200).json({
        status: "200",
        message: "Status updated successfully",
        statusData: updatedStatus,
      });
    } catch (error) {
      console.error("Update status error:", error);

      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);

/**
 * DELETE - Delete status
 */
router.delete(
  "/:statusId",
  authenticate,
  async (req: Request<{ statusId: string }>, res: Response) => {
    try {
      const { statusId } = req.params;

      await prisma.statuses.delete({
        where: {
          id: statusId,
        },
      });

      res.status(200).json({
        status: "200",
        message: "Status deleted successfully",
      });
    } catch (error) {
      console.error("Delete status error:", error);

      res.status(500).json({
        status: "500",
        message: "Internal server error",
      });
    }
  }
);

export default router;
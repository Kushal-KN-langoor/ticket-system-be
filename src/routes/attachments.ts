import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { upload } from "../middleware/upload";
import prisma from "../lib/prisma";
import { supabase } from "../lib/supabase";
import { v4 as uuid } from "uuid";

const router = Router();

/**
 * POST /api/attachments
 * Upload attachment to a ticket
 */
router.post(
  "/",
  authenticate,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { ticket_id } = req.body;

      if (!ticket_id) {
        return res.status(400).json({
          status: "400",
          message: "ticket_id is required",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: "400",
          message: "No file uploaded",
        });
      }

      // Check ticket exists
      const ticket = await prisma.tickets.findUnique({
        where: {
          id: ticket_id,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          status: "404",
          message: "Ticket not found",
        });
      }

      // Generate unique filename
      const extension =
        req.file.originalname.split(".").pop() || "bin";

      const filename = `${ticket_id}/${uuid()}.${extension}`;

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        console.error(error);

        return res.status(500).json({
          status: "500",
          message: "Failed to upload file",
          detail: error.message,
        });
      }

      // Save attachment
      const attachment = await prisma.attachments.create({
        data: {
          ticket_id,
          user_id: req.user!.id,
          file_name: req.file.originalname,
          file_url: data.path,
          file_type: req.file.mimetype,
        },
      });

      // Create activity log
      await prisma.ticket_activity_logs.create({
        data: {
          ticket_id,
          user_id: req.user!.id,
          action: `uploaded attachment "${req.file.originalname}"`,
        },
      });

      return res.status(201).json({
        status: "201",
        message: "Attachment uploaded successfully",
        attachment,
      });
    } catch (error: any) {
      console.error(error);

      return res.status(500).json({
        status: "500",
        message: "Failed to upload attachment",
        detail: error.message,
      });
    }
  }
);

/**
 * GET /api/attachments/ticket/:ticket_id
 * List all attachments for a ticket
 */
router.get(
  "/ticket/:ticket_id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const ticket_id = req.params.ticket_id as string;

      const ticket = await prisma.tickets.findUnique({ where: { id: ticket_id } });
      if (!ticket) {
        return res.status(404).json({ status: "404", message: "Ticket not found" });
      }

      const attachments = await prisma.attachments.findMany({
        where: { ticket_id },
        orderBy: { uploaded_at: "desc" },
      });

      return res.json({ status: "200", attachments });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ status: "500", message: "Failed to list attachments", detail: error.message });
    }
  }
);

/**
 * GET /api/attachments/:id
 * Get a temporary signed URL to view/download a specific attachment
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      const attachment = await prisma.attachments.findUnique({ where: { id } });
      if (!attachment) {
        return res.status(404).json({ status: "404", message: "Attachment not found" });
      }

      const { data, error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .createSignedUrl(attachment.file_url, 60 * 5); // valid for 5 minutes

      if (error) {
        console.error(error);
        return res.status(500).json({ status: "500", message: "Failed to generate signed URL", detail: error.message });
      }

      return res.json({
        status: "200",
        attachment,
        url: data.signedUrl,
        expires_in_seconds: 60 * 5,
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ status: "500", message: "Failed to fetch attachment", detail: error.message });
    }
  }
);

/**
 * DELETE /api/attachments/:id
 * Remove an attachment from storage and the database
 */
router.delete(
  "/:id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      const attachment = await prisma.attachments.findUnique({ where: { id } });
      if (!attachment) {
        return res.status(404).json({ status: "404", message: "Attachment not found" });
      }

      const { error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .remove([attachment.file_url]);

      if (error) {
        console.error(error);
        return res.status(500).json({ status: "500", message: "Failed to delete file from storage", detail: error.message });
      }

      await prisma.attachments.delete({ where: { id } });

      if (attachment.ticket_id) {
        await prisma.ticket_activity_logs.create({
          data: {
            ticket_id: attachment.ticket_id,
            user_id: req.user!.id,
            action: `deleted attachment "${attachment.file_name}"`,
          },
        });
      }

      return res.json({ status: "200", message: "Attachment deleted successfully" });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ status: "500", message: "Failed to delete attachment", detail: error.message });
    }
  }
);

export default router;
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { upload } from "../middleware/upload";
import prisma from "../lib/prisma";
import { supabase } from "../lib/supabase";
import { v4 as uuid } from "uuid";

const router = Router();

// POST /api/attachments — upload to a ticket OR a comment
router.post("/", authenticate, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { ticket_id, comment_id } = req.body;

    if (!ticket_id && !comment_id) {
      return res.status(400).json({ status: "400", message: "ticket_id or comment_id is required" });
    }

    if (!req.file) {
      return res.status(400).json({ status: "400", message: "No file uploaded" });
    }

    // If comment_id provided, verify comment exists and get its ticket_id
    let resolvedTicketId = ticket_id;
    if (comment_id) {
      const comment = await prisma.comments.findUnique({ where: { id: comment_id } });
      if (!comment) return res.status(404).json({ status: "404", message: "Comment not found" });
      resolvedTicketId = comment.ticket_id; // always link to the ticket too
    }

    // If ticket_id provided, verify ticket exists
    if (resolvedTicketId) {
      const ticket = await prisma.tickets.findUnique({ where: { id: resolvedTicketId } });
      if (!ticket) return res.status(404).json({ status: "404", message: "Ticket not found" });
    }

    // Generate unique filename
    const extension = req.file.originalname.split(".").pop() || "bin";
    const folder = comment_id ? `comments/${comment_id}` : `tickets/${resolvedTicketId}`;
    const filename = `${folder}/${uuid()}.${extension}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error(error);
      return res.status(500).json({ status: "500", message: "Failed to upload file", detail: error.message });
    }

    // Save to DB — link to both ticket and comment if comment_id provided
    const attachment = await prisma.attachments.create({
      data: {
        ticket_id: resolvedTicketId ?? null,
        comment_id: comment_id ?? null,
        user_id: req.user!.id,
        file_name: req.file.originalname,
        file_url: data.path,
        file_type: req.file.mimetype,
      },
    });

    // Log activity
    if (resolvedTicketId) {
      await prisma.ticket_activity_logs.create({
        data: {
          ticket_id: resolvedTicketId,
          user_id: req.user!.id,
          action: comment_id
            ? `uploaded attachment "${req.file.originalname}" on a comment`
            : `uploaded attachment "${req.file.originalname}"`,
        } as any,
      });
    }

    return res.status(201).json({ status: "201", message: "Attachment uploaded successfully", attachment });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ status: "500", message: "Failed to upload attachment", detail: error.message });
  }
});

// GET /api/attachments/ticket/:ticket_id — all attachments for a ticket
router.get("/ticket/:ticket_id", authenticate, async (req: Request, res: Response) => {
  try {
    const ticket_id = req.params.ticket_id as string;

    const ticket = await prisma.tickets.findUnique({ where: { id: ticket_id } });
    if (!ticket) return res.status(404).json({ status: "404", message: "Ticket not found" });

    const attachments = await prisma.attachments.findMany({
      where: { ticket_id, comment_id: null }, // only ticket-level attachments
      orderBy: { uploaded_at: "desc" },
    });

    return res.json({ status: "200", total: attachments.length, attachments });
  } catch (error: any) {
    return res.status(500).json({ status: "500", message: "Failed to list attachments", detail: error.message });
  }
});

// GET /api/attachments/comment/:comment_id — all attachments for a comment
router.get("/comment/:comment_id", authenticate, async (req: Request, res: Response) => {
  try {
    const comment_id = req.params.comment_id as string;

    const comment = await prisma.comments.findUnique({ where: { id: comment_id } });
    if (!comment) return res.status(404).json({ status: "404", message: "Comment not found" });

    const attachments = await prisma.attachments.findMany({
      where: { comment_id },
      orderBy: { uploaded_at: "desc" },
    });

    return res.json({ status: "200", total: attachments.length, attachments });
  } catch (error: any) {
    return res.status(500).json({ status: "500", message: "Failed to list attachments", detail: error.message });
  }
});

// GET /api/attachments/:id — get signed URL for a specific attachment
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const attachment = await prisma.attachments.findUnique({ where: { id } });
    if (!attachment) return res.status(404).json({ status: "404", message: "Attachment not found" });

    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .createSignedUrl(attachment.file_url, 60 * 5); // 5 minutes

    if (error) {
      return res.status(500).json({ status: "500", message: "Failed to generate signed URL", detail: error.message });
    }

    return res.json({ status: "200", attachment, url: data.signedUrl, expires_in_seconds: 300 });
  } catch (error: any) {
    return res.status(500).json({ status: "500", message: "Failed to fetch attachment", detail: error.message });
  }
});

// DELETE /api/attachments/:id
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const attachment = await prisma.attachments.findUnique({ where: { id } });
    if (!attachment) return res.status(404).json({ status: "404", message: "Attachment not found" });

    // Only uploader or Admin can delete
    if (attachment.user_id !== req.user!.id && req.user!.role !== "Admin") {
      return res.status(403).json({ status: "403", message: "Not allowed to delete this attachment" });
    }

    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .remove([attachment.file_url]);

    if (error) {
      return res.status(500).json({ status: "500", message: "Failed to delete file from storage", detail: error.message });
    }

    await prisma.attachments.delete({ where: { id } });

    if (attachment.ticket_id) {
      await prisma.ticket_activity_logs.create({
        data: {
          ticket_id: attachment.ticket_id,
          user_id: req.user!.id,
          action: `deleted attachment "${attachment.file_name}"`,
        } as any,
      });
    }

    return res.json({ status: "200", message: "Attachment deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ status: "500", message: "Failed to delete attachment", detail: error.message });
  }
});

export default router;
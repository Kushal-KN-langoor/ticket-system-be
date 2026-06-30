import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import prisma from "../lib/prisma";

const router = Router();

// ─────────────────────────────────────────────
// POST /api/tickets — Create a ticket
// ─────────────────────────────────────────────
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      ticket_order,
      project_id,
      assigned_to,
      due_date,
    } = req.body;

    // Required fields
    if (!title) return res.status(400).json({ message: "title is required" });
    if (!project_id) return res.status(400).json({ message: "project_id is required" });

    // Validate status
    const validStatuses = ["Open", "In Progress", "Closed", "On Hold"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}` });
    }

    // Validate priority
    const validPriorities = ["Low", "Medium", "High", "Critical"];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ message: `priority must be one of: ${validPriorities.join(", ")}` });
    }

    // Check project exists
    const project = await prisma.projects.findUnique({ where: { id: project_id } });
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Check assigned user exists (if provided)
    if (assigned_to) {
      const assignee = await prisma.users.findUnique({ where: { id: assigned_to } });
      if (!assignee) return res.status(404).json({ message: "Assigned user not found" });
    }

    // Auto-generate ticket_number: TKT-0001, TKT-0002 ...
    const count = await prisma.tickets.count();
    const ticket_number = `TKT-${String(count + 1).padStart(4, "0")}`;

    const ticket = await prisma.tickets.create({
      data: {
        ticket_number,
        title,
        description: description ?? null,
        status: status ?? "Open",
        priority: priority ?? "Medium",
        ticket_order: ticket_order ?? null,
        project_id,
        created_by: req.user!.id,          // from JWT — who is logged in
        assigned_to: assigned_to ?? null,
        due_date: due_date ? new Date(due_date) : null,
      },
      include: {
        users_tickets_created_byTousers: { select: { id: true, name: true, email: true } },
        users_tickets_assigned_toTousers: { select: { id: true, name: true, email: true } },
        projects: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ ticket });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Failed to create ticket", detail: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/tickets — List all tickets
// ─────────────────────────────────────────────
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { project_id, status, priority, assigned_to } = req.query;

    const tickets = await prisma.tickets.findMany({
      where: {
        ...(project_id && { project_id: String(project_id) }),
        ...(status && { status: String(status) }),
        ...(priority && { priority: String(priority) }),
        ...(assigned_to && { assigned_to: String(assigned_to) }),
      },
      orderBy: { created_at: "desc" },
      include: {
        users_tickets_created_byTousers: { select: { id: true, name: true, email: true } },
        users_tickets_assigned_toTousers: { select: { id: true, name: true, email: true } },
        projects: { select: { id: true, name: true } },
        comments: true,
        attachments: true,
      },
    });

    res.json({ total: tickets.length, tickets });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch tickets", detail: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/tickets/:id — Single ticket
// ─────────────────────────────────────────────
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: req.params.id },
      include: {
        users_tickets_created_byTousers: { select: { id: true, name: true, email: true } },
        users_tickets_assigned_toTousers: { select: { id: true, name: true, email: true } },
        projects: { select: { id: true, name: true } },
        comments: {
          include: { users: { select: { id: true, name: true, email: true } } },
        },
        attachments: true,
        ticket_activity_logs: true,
      },
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json({ ticket });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch ticket", detail: error.message });
  }
});

// ─────────────────────────────────────────────
// PUT /api/tickets/:id — Update ticket (Admin + Editor)
// ─────────────────────────────────────────────
router.put("/:id", authenticate, requireRole(["Admin", "Editor"]), async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, ticket_order, assigned_to, due_date, closed_at } = req.body;

    const existing = await prisma.tickets.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Ticket not found" });

    const updated = await prisma.tickets.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(ticket_order !== undefined && { ticket_order }),
        ...(assigned_to !== undefined && { assigned_to }),
        ...(due_date !== undefined && { due_date: due_date ? new Date(due_date) : null }),
        ...(closed_at !== undefined && { closed_at: closed_at ? new Date(closed_at) : null }),
        updated_at: new Date(),
      },
    });

    res.json({ ticket: updated });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update ticket", detail: error.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/tickets/:id — Admin only
// ─────────────────────────────────────────────
router.delete("/:id", authenticate, requireRole(["Admin"]), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.tickets.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Ticket not found" });

    await prisma.tickets.delete({ where: { id: req.params.id } });
    res.json({ message: "Ticket deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to delete ticket", detail: error.message });
  }
});

export default router;
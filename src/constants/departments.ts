// Central list of departments — edit this to match your org.
// Both signup (dropdown) and ticket filtering rely on this single source of truth.
export const DEPARTMENTS = [
  "HR",
  "Hardware",
  "Software",
  "Project Management",
  "Finance",
  "Sales",
  "Marketing",
  "IT Support",
  "Operations",
  "Legal",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
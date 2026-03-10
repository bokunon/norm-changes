import { vi } from "vitest";

export const prisma = {
  normSource: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  normChange: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  },
  normChangeTag: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  notificationFilter: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  $disconnect: vi.fn(),
};

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
  });

globalForPrisma.prisma = prisma;

export { Prisma, PrismaClient } from "@prisma/client";
export type {
  AuthSession,
  Location,
  Room,
  StaffInvite,
  User,
  UserRole,
  Workspace,
  WorkspaceSetting,
  WorkspaceStatus,
  WorkspaceUser,
} from "@prisma/client";

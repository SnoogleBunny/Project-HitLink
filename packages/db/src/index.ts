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

export {
  addDays,
  buildUpcomingOccurrenceDateOptions,
  dateOnlyStringToUtcDate,
  formatMinutesAsTime,
  formatOccurrenceDate,
  formatOccurrenceLabel,
  getWeekdayForDateString,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
  toDateOnlyString,
  validateOccurrenceDate,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type OccurrenceDateOption,
  type OccurrenceDateValidationResult,
  type TemplateForOccurrenceDates,
  type TemplateWithOccurrenceDates,
} from "./occurrences.js";

export { Prisma, PrismaClient } from "@prisma/client";
export type {
  AuthSession,
  AttendanceRecord,
  AttendanceState,
  BillingRecord,
  BillingRecordStatus,
  BillingRecordType,
  BillingStateStatus,
  ClassBooking,
  ClassBookingSource,
  ClassBookingStatus,
  ClassBookingType,
  ClassTemplate,
  FamilyLink,
  Guardian,
  Location,
  Member,
  MemberFormStatus,
  MemberMembership,
  MemberMembershipStatus,
  MemberStatus,
  MembershipBillingState,
  MembershipPlan,
  MembershipPlanProgramRestriction,
  Program,
  Room,
  StaffInvite,
  StaffInviteStatus,
  StripeConnectionStatus,
  StripeWebhookEvent,
  StripeWebhookProcessingStatus,
  User,
  UserRole,
  Weekday,
  Workspace,
  WorkspaceSetting,
  WorkspaceStripeSettings,
  WorkspaceStatus,
  WorkspaceUser,
} from "@prisma/client";

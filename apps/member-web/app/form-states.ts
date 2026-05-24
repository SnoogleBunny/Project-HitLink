export interface MemberLoginFormState {
  error: string | null;
}

export const emptyMemberLoginFormState: MemberLoginFormState = {
  error: null,
};

export interface TrialBookingFormState {
  error: string | null;
  confirmation: {
    classTitle: string;
    scheduledForDate: string;
    forms: Array<{
      requestId: string;
      label: string;
      href: string;
    }>;
  } | null;
}

export const emptyTrialBookingFormState: TrialBookingFormState = {
  error: null,
  confirmation: null,
};

export interface MembershipActionState {
  error: string | null;
}

export const emptyMembershipActionState: MembershipActionState = {
  error: null,
};

export interface BillingActionState {
  error: string | null;
}

export const emptyBillingActionState: BillingActionState = {
  error: null,
};

export interface BookingsActionState {
  error: string | null;
}

export const emptyBookingsActionState: BookingsActionState = {
  error: null,
};

export interface ScheduleActionState {
  error: string | null;
}

export const emptyScheduleActionState: ScheduleActionState = {
  error: null,
};

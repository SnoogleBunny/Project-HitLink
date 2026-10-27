"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSession,
  consumePublicAuthAttempt,
  clearSuccessfulPublicAuthLogin,
  getPublicAuthNetworkIdentity,
  PublicAuthThrottleError,
  getSession,
  hashPassword,
  MEMBER_SESSION_COOKIE_NAME,
  verifyPassword,
  validateNewPassword,
} from "@flowstate/auth";
import {
  FinancialError,
  PublicEnrollmentError,
  acceptPublicMembershipTerms,
  getPublishedGymWebsite,
  getPublicEnrollment,
  getPublicEnrollmentForms,
  preparePublicEnrollmentIdentity,
  prisma,
  readPublicParticipant,
  startPublicEnrollment,
  verifyPublicEnrollment,
  completeVerifiedTrial,
} from "@flowstate/db";
import {
  startPublicMembershipCheckout,
  resumePublicMembershipCheckout,
} from "@flowstate/payments";
import {
  registrationCookie,
  registrationPath,
} from "../../../lib/public-registration";
import { publicMemberOrigin } from "../../../lib/gym-website";
import { setMemberSelectionCookie } from "../../../lib/member-selection-cookie";

export async function publicRegistrationAction(
  _state: { error: string | null },
  form: FormData,
): Promise<{ error: string | null }> {
  const slug = String(form.get("slug") ?? ""),
    kind = form.get("kind") === "TRIAL" ? "TRIAL" : "MEMBERSHIP",
    offerId = String(form.get("offerId") ?? ""),
    action = String(form.get("step") ?? "");
  const jar = await cookies(),
    cookieName = registrationCookie(slug, kind),
    path = registrationPath(slug, kind, offerId);
  let nextUrl: string | undefined;
  try {
    const site = await getPublishedGymWebsite(slug);
    if (!site)
      throw new PublicEnrollmentError(
        "This gym’s registration is unavailable.",
      );
    if (action === "restart") {
      jar.delete(cookieName);
      revalidatePath(path);
      return { error: null };
    }
    if (action === "start") {
      await consumePublicAuthAttempt({
        email: String(form.get("email") ?? ""),
        action: "signup",
        portal: "member",
        networkIdentity: getPublicAuthNetworkIdentity(await headers()),
      });
      const [classTemplateId = "", scheduledForDate = ""] = String(
        form.get("bookingOption") ?? "",
      ).split("|");
      const result = await startPublicEnrollment({
        slug,
        kind,
        serviceConsent: form.get("serviceConsent") === "on",
        marketingConsent: form.get("marketingConsent") === "on",
        participant: {
          fullName: String(form.get("fullName") ?? ""),
          dateOfBirth: String(form.get("dateOfBirth") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          guardianFullName: String(form.get("guardianFullName") ?? ""),
          relationshipLabel: String(form.get("relationshipLabel") ?? ""),
          classTemplateId,
          scheduledForDate,
          offerId,
          termsFingerprint: String(form.get("termsFingerprint") ?? ""),
        },
      });
      jar.set(cookieName, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: `/gym/${slug}`,
        maxAge: 24 * 3600,
      });
    } else {
      const token = jar.get(cookieName)?.value ?? "",
        enrollment = await getPublicEnrollment({
          token,
          workspaceId: site.workspaceId,
        });
      if (
        !enrollment ||
        enrollment.kind !== kind ||
        (kind === "MEMBERSHIP" &&
          readPublicParticipant(enrollment).offerId !== offerId)
      )
        throw new PublicEnrollmentError(
          "This registration expired. Start again.",
        );
      if (action === "verify")
        await verifyPublicEnrollment({
          token,
          workspaceId: site.workspaceId,
          code: String(form.get("code") ?? "").trim(),
        });
      else {
        let session = await getSession({
          cookieStore: jar,
          cookieName: MEMBER_SESSION_COOKIE_NAME,
        });
        if (action === "account") {
          if (!enrollment.verifiedAt)
            throw new PublicEnrollmentError("Verify your email first.");
          const admission = await consumePublicAuthAttempt({
            email: enrollment.email,
            action: "login",
            portal: "member",
            networkIdentity: getPublicAuthNetworkIdentity(await headers()),
          });
          const existing = await prisma.user.findUnique({
            where: { email: enrollment.email },
          });
          const password = String(form.get("password") ?? "");
          if (
            session &&
            session.email.toLowerCase() !== enrollment.email.toLowerCase()
          )
            throw new PublicEnrollmentError(
              "Sign out before registering with a different email.",
            );
          if (
            !session &&
            existing &&
            !(await verifyPassword(password, existing.passwordHash))
          )
            throw new PublicEnrollmentError(
              "Enter the password for this email to continue.",
            );
          if (!existing) {
            const passwordError = validateNewPassword(password);
            if (passwordError) throw new PublicEnrollmentError(passwordError);
          }
          const identity = await preparePublicEnrollmentIdentity({
            token,
            workspaceId: site.workspaceId,
            actorUserId: session?.userId ?? existing?.id,
            passwordHash: !existing ? await hashPassword(password) : undefined,
          });
          if (!session) {
            await createSession({
              userId: identity.userId,
              cookieStore: jar,
              cookieName: MEMBER_SESSION_COOKIE_NAME,
              ...(existing
                ? { expectedPasswordHash: existing.passwordHash }
                : {}),
            });
            await clearSuccessfulPublicAuthLogin(admission).catch(() => {});
            session = await getSession({
              cookieStore: jar,
              cookieName: MEMBER_SESSION_COOKIE_NAME,
            });
          }
          if (!identity.reviewRequired)
            setMemberSelectionCookie(jar, site.workspaceId, identity.memberId);
        } else {
          if (
            !session ||
            session.userId !== readPublicParticipant(enrollment).accountUserId
          )
            throw new PublicEnrollmentError(
              "Sign in to the account used for this registration.",
            );
          if (action === "prepare") {
            if (kind === "MEMBERSHIP") {
              if (form.get("acceptMembership") !== "on")
                throw new PublicEnrollmentError(
                  "Confirm the membership terms before continuing.",
                );
              await acceptPublicMembershipTerms({
                token,
                workspaceId: site.workspaceId,
                actorUserId: session.userId,
              });
            }
            await getPublicEnrollmentForms({
              workspaceId: site.workspaceId,
              enrollmentId: enrollment.id,
              actorUserId: session.userId,
              ensure: true,
            });
            setMemberSelectionCookie(
              jar,
              site.workspaceId,
              enrollment.memberId!,
            );
          } else if (action === "book") {
            const result = await completeVerifiedTrial({
              workspaceId: site.workspaceId,
              enrollmentId: enrollment.id,
              actorUserId: session.userId,
              portalBaseUrl: publicMemberOrigin(),
            });
            if (
              "message" in result &&
              typeof result.message === "string" &&
              result.status === "error"
            )
              throw new PublicEnrollmentError(result.message);
          } else if (action === "payment") {
            const result = enrollment.operationId
              ? await resumePublicMembershipCheckout({
                  workspaceId: site.workspaceId,
                  operationId: enrollment.operationId,
                  actorUserId: session.userId,
                })
              : await startPublicMembershipCheckout({
                  workspaceId: site.workspaceId,
                  enrollmentId: enrollment.id,
                  actorUserId: session.userId,
                  returnUrl: `${publicMemberOrigin()}${path}`,
                });
            nextUrl = result.url;
            if (result.message && !nextUrl) {
              revalidatePath(path);
              return { error: result.message };
            }
          } else
            throw new PublicEnrollmentError(
              "Reload this registration before continuing.",
            );
        }
      }
    }
    revalidatePath(path);
  } catch (error) {
    if (
      error instanceof PublicAuthThrottleError ||
      error instanceof PublicEnrollmentError ||
      error instanceof FinancialError
    )
      return { error: error.message };
    return {
      error:
        "We could not finish that step. Your registration is saved; try again.",
    };
  }
  if (nextUrl) redirect(nextUrl);
  return { error: null };
}

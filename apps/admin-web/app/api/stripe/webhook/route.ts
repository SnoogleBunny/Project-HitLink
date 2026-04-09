import { headers } from "next/headers";
import {
  processStripeWebhookEvent,
  stripeBillingGateway,
} from "../../../../lib/stripe-billing";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return Response.json(
      {
        error: "Stripe webhook secret is not configured.",
      },
      {
        status: 500,
      },
    );
  }

  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return Response.json(
      {
        error: "Missing Stripe signature.",
      },
      {
        status: 400,
      },
    );
  }

  const payload = await request.text();
  let event;

  try {
    event = stripeBillingGateway.constructWebhookEvent({
      payload,
      signature,
      webhookSecret,
    });
  } catch {
    return Response.json(
      {
        error: "Invalid Stripe webhook signature.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await processStripeWebhookEvent({
    event,
  });

  if (result.status === "error") {
    return Response.json(
      {
        error: result.message,
      },
      {
        status: 500,
      },
    );
  }

  return Response.json({
    ok: true,
    status: result.status,
  });
}


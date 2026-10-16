import Link from "next/link";
import { Badge, Money } from "@flowstate/ui";
import type { FinancialReviewItem } from "../../../lib/financial-review";
export function FinancialReviewQueue({
  items,
  timezone,
  history = false,
}: {
  items: FinancialReviewItem[];
  timezone: string;
  history?: boolean;
}) {
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(value);
  return (
    <section className="management-card">
      <h3>
        {history ? "Resolved payment reviews" : "Payments needing review"}
      </h3>
      {!items.length ? (
        <p className="management-copy">
          {history
            ? "No resolved payment reviews yet."
            : "No payment reviews are waiting."}
        </p>
      ) : (
        <div className="hl-payment-records">
          {items.map((item) => (
            <article key={item.id}>
              <div className="hl-payment-record-heading">
                <div>
                  <h4>
                    {item.payerAccount?.member.fullName ?? "Payer not recorded"}
                  </h4>
                  <p>For {item.member?.fullName ?? "account service"}</p>
                </div>
                <Badge tone={item.resolvedAt ? "success" : "warning"}>
                  {item.resolvedAt ? "Resolved" : "Needs review"}
                </Badge>
              </div>
              <p>{item.reason}</p>
              <dl>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {item.amountCents !== null && item.currency ? (
                      <Money
                        amountMinor={item.amountCents}
                        currency={item.currency}
                      />
                    ) : (
                      "Amount not recorded"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{item.resolvedAt ? "Resolved" : "Opened"}</dt>
                  <dd>{date(item.resolvedAt ?? item.createdAt)}</dd>
                </div>
              </dl>
              <Link
                className="text-link"
                href={`/dashboard/billing/reviews/${item.id}`}
              >
                Review details
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

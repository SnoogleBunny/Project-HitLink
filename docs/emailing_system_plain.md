# How Flowstate Email Works

Flowstate sends email for moments when the gym needs a reliable paper trail. This includes trial confirmations, booking confirmations, class reminders, failed payment notices, announcements, and payment method update requests.

The app saves each email before it tries to send it. This gives staff a record of what Flowstate planned to send, who it was going to, when it was created, and whether it was sent. Saving first also means a temporary sending problem does not erase the email.

When an email is ready, Flowstate puts it in a sending queue. A sender then picks up the email and delivers it through the email service connected to Flowstate. In development, the sender can simply record what would have been sent. That lets the team test email flows without sending real messages to customers.

If sending works, Flowstate marks the email as sent and saves the time it went out. If sending fails, Flowstate keeps the email, records the problem, and can try again later. Staff can see that the message was created even if the outside email service had a temporary issue.

Announcements use the same flow as reminders and billing messages. The owner writes the announcement, chooses whether it should also go by email, and Flowstate creates saved email records for the matching customers. Those records then move through the same sending queue as every other email.

When a customer says they did not get an email, staff should check the saved email record first. Confirm the email address, the message type, the time it was created, the sending status, and any saved error. If Flowstate says the email was sent, the customer may need to check spam, promotions, or an old inbox. If Flowstate says the email failed, staff can fix the address or retry after the sending issue is resolved.

This design keeps email reliable because the app does not depend on everything working at the exact moment a customer books, pays, or receives an announcement. Flowstate records the intent first, then sends, tracks, and retries from that record.

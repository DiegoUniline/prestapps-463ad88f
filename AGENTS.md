# Project Notes

## Architecture rules

- Public self-service registration must verify the phone number with a WhatsApp one-time code before any account is created; the code lives only server-side (hashed, short-lived) and the signup endpoint never returns it. Why: prevents fake or duplicate company signups and guarantees the WhatsApp notifications the product depends on will actually reach a real number.
- Every WhatsApp send that matters operationally (customer codes, receipts, payment alerts, admin alerts) must retry transient failures and never let a delivery error abort the underlying business transaction; a failed send is logged, not thrown, unless it is the verification code itself. Why: a chat-provider outage must not block payments or account creation.
- Registration, billing and notification flows are triggered from the Edge Functions in `supabase/functions/`, never from browser code, so the same flow runs no matter which client starts it. Why: browser-triggered flows break when a tab is closed and can be tampered with.

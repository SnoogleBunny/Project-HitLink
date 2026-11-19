export default function Loading() {
  return (
    <main
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className="member-auth-page"
      role="status"
      style={{ alignItems: "start", paddingTop: "clamp(4rem, 18vh, 9rem)" }}
    >
      <section className="member-auth-card">
        <p
          className="member-eyebrow"
          style={{ color: "var(--member-sidebar)" }}
        >
          Member portal
        </p>
        <h1>Opening your member portal</h1>
        <p className="member-auth-description">
          Please wait while this page gets ready.
        </p>
      </section>
    </main>
  );
}

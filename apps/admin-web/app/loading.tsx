export default function Loading() {
  return (
    <main
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className="auth-page"
      role="status"
      style={{ alignItems: "start", paddingTop: "clamp(4rem, 18vh, 9rem)" }}
    >
      <section
        className="auth-card"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <p className="auth-eyebrow">Flowstate admin</p>
        <h1>Opening your admin workspace</h1>
        <p className="auth-description">
          Please wait while this page gets ready.
        </p>
      </section>
    </main>
  );
}

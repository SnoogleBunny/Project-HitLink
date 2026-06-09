export default function Home() {
  return (
    <main
      style={{
        display: "grid",
        gap: "1rem",
        maxWidth: "48rem",
        margin: "0 auto",
        padding: "4rem 1.5rem",
      }}
    >
      <h1>Flowstate API</h1>
      <p>This placeholder keeps the repo shape stable for future API work.</p>
      <p>
        Health check: <a href="/api/v1/health">/api/v1/health</a>
      </p>
    </main>
  );
}

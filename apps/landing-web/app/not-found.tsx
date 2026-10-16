import Link from "next/link";
export default function NotFound() { return <main style={{ maxWidth: 720, margin: "80px auto", padding: 24 }}><p>404 · Page not found</p><h1>That page is not available.</h1><p>Return to HitLink or open the service terms and privacy policy.</p><nav><Link href="/">Home</Link> · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></nav></main>; }

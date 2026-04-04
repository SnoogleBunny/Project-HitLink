import { Button, Code } from "@hitlink/ui";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logo}>HitLink Admin</div>
        <ol>
          <li>The future owner and coach admin experience will live here.</li>
          <li>
            Phase 1 only establishes the app shell and shared workspace imports.
          </li>
        </ol>

        <div className={styles.ctas}>
          <Button appName="admin-web" className={styles.secondary}>
            Shared UI is wired
          </Button>
        </div>
      </main>
      <footer className={styles.footer}>
        <p>
          App package: <Code>@hitlink/ui</Code>
        </p>
        <p>Port 3000</p>
      </footer>
    </div>
  );
}

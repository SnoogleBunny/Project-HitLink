import { Button, Code } from "@hitlink/ui";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logo}>HitLink Member</div>
        <ol>
          <li>The future customer and member-facing experience will live here.</li>
          <li>
            Phase 1 keeps this app as a thin placeholder with shared workspace imports.
          </li>
        </ol>

        <div className={styles.ctas}>
          <Button appName="member-web" className={styles.secondary}>
            Shared UI is wired
          </Button>
        </div>
      </main>
      <footer className={styles.footer}>
        <p>
          App package: <Code>@hitlink/ui</Code>
        </p>
        <p>Port 3001</p>
      </footer>
    </div>
  );
}

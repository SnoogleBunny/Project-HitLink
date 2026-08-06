import type { ReactNode } from "react";

interface EntryShellItem {
  label: string;
  description: string;
}

interface EntryShellProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  identityEyebrow: string;
  identityTitle: string;
  identityDescription: string;
  identityItems?: EntryShellItem[];
}

export function EntryShell({
  children,
  eyebrow,
  title,
  description,
  identityEyebrow,
  identityTitle,
  identityDescription,
  identityItems = [],
}: EntryShellProps) {
  return (
    <main className="entry-page" aria-labelledby="entry-title">
      <section className="entry-identity" aria-label="Flowstate admin context">
        <div className="entry-identity-inner">
          <p className="entry-identity-eyebrow">{identityEyebrow}</p>
          <div className="entry-identity-copy">
            <p className="entry-wordmark">Flowstate</p>
            <h2>{identityTitle}</h2>
            <p>{identityDescription}</p>
          </div>

          {identityItems.length > 0 ? (
            <dl className="entry-identity-list">
              {identityItems.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      <section className="entry-task">
        <div className="entry-task-inner">
          <p className="entry-eyebrow">{eyebrow}</p>
          <div className="entry-heading">
            <h1 id="entry-title">{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

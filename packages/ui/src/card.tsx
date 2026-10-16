import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  title,
  children,
  footer,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section {...props} className={`hl-card ${className}`}>
      {title ? <h2 className="hl-card-title">{title}</h2> : null}
      <div className="hl-card-body">{children}</div>
      {footer ? <div className="hl-card-footer">{footer}</div> : null}
    </section>
  );
}

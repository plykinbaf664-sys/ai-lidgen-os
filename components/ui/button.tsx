import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
};

export function Button({
  children,
  className,
  variant = "secondary",
  loading = false,
  disabled = false,
  iconOnly = false,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button-${variant}`,
    iconOnly ? "ui-button-icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="ui-button-spinner" /> : null}
      <span className="ui-button-label">{children}</span>
    </button>
  );
}

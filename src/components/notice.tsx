import type * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ICON = { destructive: CircleAlert, success: CircleCheck, warning: TriangleAlert, info: Info } as const;

/** Page banner: shadcn <Alert> with the matching icon, optional title and a description body. */
export function Notice({
  variant = "info",
  title,
  className,
  children,
}: {
  variant?: keyof typeof ICON;
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const Icon = ICON[variant];
  return (
    <Alert variant={variant} className={className}>
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription className="text-inherit">{children}</AlertDescription>}
    </Alert>
  );
}

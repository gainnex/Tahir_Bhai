import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Form-level error / success banner for action forms. */
export function FormStatus({ error, success }: { error?: string; success?: string }) {
  if (error)
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertDescription className="text-inherit">{error}</AlertDescription>
      </Alert>
    );
  if (success)
    return (
      <Alert variant="success">
        <CircleCheck />
        <AlertDescription className="text-inherit">{success}</AlertDescription>
      </Alert>
    );
  return null;
}

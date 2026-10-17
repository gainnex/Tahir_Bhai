"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

// Plain useActionState form: loginAction validates and redirects itself (fields login/password/next).
export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="grid gap-4">
      {state.error && <Notice variant="destructive">{state.error}</Notice>}
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-2">
        <Label htmlFor="login">Username or email</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          defaultValue={state.login}
          className="h-11"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        <LogIn /> {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

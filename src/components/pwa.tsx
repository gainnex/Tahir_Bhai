"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// Installable app (changes/changes.pdf §10). Registers the service worker and keeps the browser's
// install prompt (Android / desktop Chrome & Edge) so "Install app" can show it later; iPhones get
// "Add to Home Screen" instructions instead, as Safari has no install prompt.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Registered at module load: the event can fire before any component mounts
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Mount once (root layout): registers /sw.js in production builds. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the app works without it, only the offline page and installability are lost
    });
  }, []);
  return null;
}

type InstallState = "installed" | "prompt" | "ios" | "unsupported";

function installState(): InstallState {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "unsupported";
}

/**
 * "Install app" entry for the user menu; hidden when already installed or not installable.
 * On iPhone it calls `onIosHelp` — render <IosInstallDialog> outside the menu, which unmounts on close.
 */
export function InstallAppMenuItem({ onIosHelp }: { onIosHelp: () => void }) {
  const state = useSyncExternalStore(subscribe, installState, () => "unsupported" as InstallState);
  if (state === "installed" || state === "unsupported") return null;

  async function install() {
    if (state === "ios") return onIosHelp();
    const e = deferred;
    if (!e) return;
    await e.prompt();
    await e.userChoice;
    deferred = null; // a prompt can only be used once
    notify();
  }

  return (
    <DropdownMenuItem onSelect={install}>
      <Download /> Install app
    </DropdownMenuItem>
  );
}

export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Install on iPhone / iPad</DialogTitle>
          <DialogDescription>Add the app to your home screen to open it like any other app.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-2">
            <Share className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              In Safari, tap the <strong>Share</strong> button at the bottom of the screen.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <SquarePlus className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </span>
          </li>
        </ol>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

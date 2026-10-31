import { useEffect, useState } from "react";

// Instalação do painel como aplicativo (PWA). O navegador avisa quando a instalação é possível
// (evento beforeinstallprompt — Chrome, Edge, Android). No iPhone/iPad não há esse evento:
// a instalação é feita pelo menu Compartilhar → "Adicionar à Tela de Início".
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
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

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* instalação opcional */ });
  });
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstallApp() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const installed = isStandalone();
  return {
    /** Instalação com um clique disponível (Chrome/Edge/Android). */
    canPrompt: !installed && deferred !== null,
    /** iPhone/iPad: mostrar instrução manual. */
    iosHint: !installed && isIos(),
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      notify();
    },
  };
}

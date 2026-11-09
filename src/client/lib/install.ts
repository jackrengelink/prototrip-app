/** Captures the browser's "install app" prompt so we can offer a button for it. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return choice.outcome === 'accepted';
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Service worker updates ------------------------------------------------- */

let waitingWorker: ServiceWorker | null = null;
let reloadWhenControllerChanges = false;
const updateListeners = new Set<() => void>();

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const track = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker = worker;
              updateListeners.forEach((l) => l());
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          updateListeners.forEach((l) => l());
        }
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Check for a new version every 30 minutes while open.
        window.setInterval(() => reg.update().catch(() => undefined), 30 * 60_000);
      })
      .catch(() => undefined);
    // Only reload after the user asked for the new version. (On a first visit the new
    // worker also takes control, and reloading then would wipe what the user is typing.)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadWhenControllerChanges) return;
      reloadWhenControllerChanges = false;
      window.location.reload();
    });
  });
}

export function hasUpdate(): boolean {
  return waitingWorker !== null;
}

export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  reloadWhenControllerChanges = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function onUpdate(fn: () => void): () => void {
  updateListeners.add(fn);
  return () => updateListeners.delete(fn);
}

import { useEffect, useState } from 'react';

/**
 * "Install app" button (PWA). Listens for the browser's beforeinstallprompt
 * event and shows a button that triggers the native install flow. Hidden if the
 * app is already installed or the browser doesn't support it.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Already running as an installed PWA?
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  return (
    <button
      className="btn sm outline hide-sm"
      title="Install LeadOS as an app"
      onClick={async () => {
        deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      ⬇ Install
    </button>
  );
}

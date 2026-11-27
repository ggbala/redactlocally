import { Lock, WifiOff, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function TrustBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const isOfflineBundle =
    typeof __IS_OFFLINE_BUILD__ !== 'undefined' && __IS_OFFLINE_BUILD__;

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div
      data-testid="trust-banner"
      className="w-full bg-[#0F172A] text-slate-100 border-b border-slate-800"
    >
      <div className="max-w-[1080px] w-full mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-medium text-white">
          <Lock className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
          <span>
            100% Local &amp; Offline Processing &middot; Zero Server Uploads &middot; Your data never leaves this browser
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-300">
          <span
            title="Open DevTools (F12) → Network tab while sanitizing to confirm zero outbound data."
            className="hidden sm:inline cursor-help underline decoration-dotted decoration-slate-500 underline-offset-3 hover:text-white transition-colors"
          >
            Verify in DevTools &rarr; Network
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-[#6EE7B7] font-medium border border-emerald-400/30">
            {isOffline ? (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline Active</span>
              </>
            ) : isOfflineBundle ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                <span>Standalone Offline HTML</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                <span>Offline Ready</span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

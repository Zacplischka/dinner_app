import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GUIDE_LISTS } from '../demo/guideData';
import { useAuthStore } from '../stores/authStore';
import GoogleSignInButton from '../components/GoogleSignInButton';
import UserMenu from '../components/UserMenu';

export default function GuideHomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();

  const featured = useMemo(() => {
    const order = ['tonight', 'after-work', 'special', 'east-to-warrandyte'];
    return order
      .map((id) => GUIDE_LISTS.find((l) => l.id === id))
      .filter(Boolean);
  }, []);

  return (
    <main className="min-h-screen bg-warm-gradient px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[420px] bg-amber/5 rounded-full blur-3xl pointer-events-none" />

      {/* Auth section - top right */}
      <div className="absolute top-4 right-4 z-20">
        {!isLoading && !isAuthenticated ? (
          <GoogleSignInButton variant="compact" />
        ) : isAuthenticated ? (
          <UserMenu />
        ) : null}
      </div>

      <div className="max-w-2xl mx-auto pt-10 pb-24 relative z-10 animate-fade-in">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-midnight-100/70 border border-midnight-50/40 flex items-center justify-center shadow-card overflow-hidden">
              <img src="/dinder-logo.png" alt="Dinder" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-cream text-glow">Dinder</h1>
              <p className="text-cream-400">Melbourne’s best — curated. Then decided.</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.25em] uppercase text-cream-500 mb-2">Melbourne · East side → Warrandyte</p>
                <p className="text-sm text-cream-400">A curated guide with Google-backed signals — plus a decider when the group can’t.</p>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className="badge badge-amber animate-glow-pulse">Editor-led</span>
                <span className="badge bg-midnight-200 text-cream-300 border border-midnight-50/30">Google stars</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="label">Search</label>
                <input
                  className="input"
                  placeholder="Try: after-work, Richmond, Italian, date night…"
                  disabled
                />
                <p className="mt-2 text-xs text-cream-500/70 italic">Demo UI: search is non-functional.</p>
              </div>
              <div className="flex flex-col gap-2 justify-end">
                <button className="btn btn-primary" onClick={() => navigate('/create')}>
                  Make the Call
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/lists/tonight')}>
                  Browse shortlists
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              className="card text-left"
              onClick={() => navigate('/lists/after-work')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-amber font-semibold">Tonight</p>
                  <h2 className="font-display text-xl font-semibold text-cream">After-work winners</h2>
                  <p className="text-sm text-cream-400 mt-1">Fast picks for 5:30pm decisions.</p>
                </div>
                <span className="badge badge-amber">Weeknights</span>
              </div>
            </button>

            <button
              className="card text-left"
              onClick={() => navigate('/lists/special')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-amber font-semibold">The Edit</p>
                  <h2 className="font-display text-xl font-semibold text-cream">Special occasion</h2>
                  <p className="text-sm text-cream-400 mt-1">High impact, high confidence.</p>
                </div>
                <span className="badge badge-amber">Celebration</span>
              </div>
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-cream">Shortlists</h2>
              <button className="text-amber hover:text-amber-200 text-sm" onClick={() => navigate('/lists/tonight')}>
                View all
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {featured.map((l) => (
                <button
                  key={l!.id}
                  onClick={() => navigate(`/lists/${l!.id}`)}
                  className="text-left p-4 rounded-2xl bg-midnight-200/50 border border-midnight-50/20 hover:border-amber/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-semibold text-cream">{l!.title}</p>
                      <p className="text-sm text-cream-500">{l!.subtitle}</p>
                      <p className="text-xs text-cream-500/70 mt-2">{l!.restaurantIds.length} places</p>
                    </div>
                    {l!.badge && <span className="badge badge-amber">{l!.badge}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="text-center text-xs text-cream-500/60 pt-2">
            Demo build: guide data + decider are local only.
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-cream-500/40 text-xs tracking-widest uppercase">
        <div className="w-8 h-px bg-cream-500/20" />
        <span>Curate · Decide</span>
        <div className="w-8 h-px bg-cream-500/20" />
      </div>
    </main>
  );
}

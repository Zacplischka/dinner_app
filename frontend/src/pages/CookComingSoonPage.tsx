// Cook Branch placeholder (#255): the fork's Cook card routes here until the
// Cook setup ticket lands.

import { useNavigate } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';

export default function CookComingSoonPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader title="Cooking" showBackButton onBack={() => navigate('/')} />

      <div className="mx-auto w-full max-w-md px-4 py-16 text-center animate-fade-in">
        <p className="mb-4 text-5xl" aria-hidden="true">
          🍳
        </p>
        <h1 className="mb-3 text-2xl font-black text-text">Cooking isn&rsquo;t ready yet</h1>
        <p className="mb-8 text-sm text-muted">
          Soon you&rsquo;ll swipe recipes together and split the shopping list. Until then, pick Eat
          Out or Takeaway.
        </p>
        <button onClick={() => navigate('/')} className="btn btn-primary min-h-[48px] px-6">
          Back to tonight&rsquo;s choices
        </button>
      </div>
    </main>
  );
}

// Floating Mobile Navigation Component
// A beautiful bottom navigation bar that's always accessible on mobile

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface FloatingNavProps {
  showCreateButton?: boolean;
}

export default function FloatingNav({ showCreateButton: _showCreateButton = true }: FloatingNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
        setIsExpanded(false);
      } else {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Determine active route
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    { path: '/home-v2', icon: 'home', label: 'Home' },
    { path: '/explore', icon: 'explore', label: 'Explore' },
    { path: '/create', icon: 'create', label: 'Start' },
  ];

  return (
    <>
      {/* Floating navigation bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 sm:hidden transition-all duration-300 safe-bottom
          ${isVisible ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        {/* Backdrop blur container */}
        <div className="mx-4 mb-4">
          <div className="bg-midnight-100/95 backdrop-blur-xl rounded-2xl border border-midnight-50/50 shadow-card-hover overflow-hidden">
            {/* Main nav items */}
            <div className="flex items-center justify-around px-2 py-2">
              {navItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => {
                    if (item.icon === 'create') {
                      setIsExpanded(!isExpanded);
                    } else {
                      navigate(item.path);
                      setIsExpanded(false);
                    }
                  }}
                  className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-300
                    ${item.icon === 'create'
                      ? 'bg-gradient-to-r from-amber to-amber-400 text-midnight shadow-glow scale-105'
                      : isActive(item.path)
                        ? 'text-amber bg-amber/10'
                        : 'text-cream-400 hover:text-cream'
                    }
                  `}
                >
                  {item.icon === 'home' && (
                    <svg className="w-6 h-6" fill={isActive(item.path) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(item.path) ? 0 : 1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  )}
                  {item.icon === 'explore' && (
                    <svg className="w-6 h-6" fill={isActive(item.path) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(item.path) ? 0 : 1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  {item.icon === 'create' && (
                    <svg className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  <span className="text-xs font-medium">{item.label}</span>

                  {/* Active indicator dot */}
                  {isActive(item.path) && item.icon !== 'create' && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Expanded menu */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out
                ${isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}
              `}
            >
              <div className="px-4 pb-4 pt-2 border-t border-midnight-50/30 space-y-2">
                <button
                  onClick={() => {
                    navigate('/create');
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-midnight-200 rounded-xl text-cream hover:bg-midnight-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Create Session</p>
                    <p className="text-cream-500 text-sm">Start a new group decision</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    navigate('/join');
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-midnight-200 rounded-xl text-cream hover:bg-midnight-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-midnight-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cream-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Join Session</p>
                    <p className="text-cream-500 text-sm">Enter a session code</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Overlay when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </>
  );
}

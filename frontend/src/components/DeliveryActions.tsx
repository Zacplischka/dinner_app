import { Link } from 'react-router-dom';

// Helper functions to generate delivery app deep links
export const generateUberEatsUrl = (restaurantName: string, address?: string): string => {
  // Uber Eats search URL - combine restaurant name with address for better accuracy
  const searchQuery = address ? `${restaurantName} ${address}` : restaurantName;
  return `https://www.ubereats.com/search?q=${encodeURIComponent(searchQuery)}`;
};

export const generateDoorDashUrl = (restaurantName: string, address?: string): string => {
  // DoorDash search URL - combine restaurant name with address for better accuracy
  const searchQuery = address ? `${restaurantName} ${address}` : restaurantName;
  return `https://www.doordash.com/search/store/${encodeURIComponent(searchQuery)}/`;
};

// The Uber Eats / DoorDash / Compare-prices action row shared by Match, Near
// Miss and the Group Order failure screens. `comparePath` is optional so the
// failure screens get the two delivery pills without the `Compare prices` link.
export function DeliveryActions({
  ubereatsHref,
  doordashHref,
  comparePath,
}: {
  ubereatsHref: string;
  doordashHref: string;
  comparePath?: string;
}) {
  return (
    <div className="flex flex-wrap gap-3 pt-3 mt-1 border-t border-line/20">
      <a
        href={ubereatsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface/80 border border-line/40 hover:border-[#06C167]/50 hover:shadow-[0_0_20px_rgba(6,193,103,0.15)] transition-all duration-300 active:scale-[0.98]"
      >
        {/* Uber Eats Logo */}
        <svg
          className="w-5 h-5 text-[#06C167] opacity-80 group-hover:opacity-100 transition-opacity duration-300"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.824a9.176 9.176 0 110 18.352 9.176 9.176 0 010-18.352zm0 3.294a5.882 5.882 0 100 11.764 5.882 5.882 0 000-11.764zm0 2.823a3.059 3.059 0 110 6.118 3.059 3.059 0 010-6.118z" />
        </svg>

        {/* Text */}
        <span className="text-sm font-medium text-text/80 group-hover:text-text transition-colors duration-300">
          Uber Eats
        </span>

        {/* External link indicator */}
        <svg
          className="w-3 h-3 text-muted/50 group-hover:text-[#06C167]/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
          />
        </svg>
      </a>

      <a
        href={doordashHref}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface/80 border border-line/40 hover:border-[#FF3008]/50 hover:shadow-[0_0_20px_rgba(255,48,8,0.15)] transition-all duration-300 active:scale-[0.98]"
      >
        {/* DoorDash Logo */}
        <svg
          className="w-5 h-5 text-[#FF3008] opacity-80 group-hover:opacity-100 transition-opacity duration-300"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M23.071 8.409a6.09 6.09 0 00-5.396-3.228H.584A.589.589 0 00.17 6.184L3.894 9.93a1.752 1.752 0 001.242.516h12.049a1.554 1.554 0 011.553 1.553 1.554 1.554 0 01-1.553 1.553H5.136a1.752 1.752 0 00-1.242.515L.17 17.816a.589.589 0 00.414 1.003h17.091a6.09 6.09 0 005.396-3.228 6.048 6.048 0 000-7.182z" />
        </svg>

        {/* Text */}
        <span className="text-sm font-medium text-text/80 group-hover:text-text transition-colors duration-300">
          DoorDash
        </span>

        {/* External link indicator */}
        <svg
          className="w-3 h-3 text-muted/50 group-hover:text-[#FF3008]/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
          />
        </svg>
      </a>

      {comparePath && (
        <Link
          to={comparePath}
          className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface/80 border border-line/40 hover:border-cyan/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all duration-300 active:scale-[0.98]"
        >
          <span className="text-sm font-medium text-text/80 group-hover:text-text transition-colors duration-300">
            Compare prices
          </span>
          <svg
            className="w-3 h-3 text-muted/50 group-hover:text-cyan/70 group-hover:translate-x-0.5 transition-all duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      )}
    </div>
  );
}

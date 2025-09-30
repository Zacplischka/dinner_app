// Home page - Welcome screen with Create/Join options
// Based on: specs/001-dinner-decider-enables/tasks.md T051

import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🍽️ Dinner Decider
          </h1>
          <p className="text-lg text-gray-600">
            Find restaurants everyone agrees on
          </p>
        </div>

        {/* Action buttons */}
        <div className="space-y-4">
          <button
            onClick={() => navigate('/create')}
            className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg"
          >
            Create Session
          </button>

          <button
            onClick={() => navigate('/join')}
            className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-blue-600 bg-white rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all shadow-lg border-2 border-blue-600"
          >
            Join Session
          </button>
        </div>

        {/* Info text */}
        <div className="text-sm text-gray-500 space-y-2">
          <p>✨ No sign-up required</p>
          <p>👥 Up to 4 participants</p>
          <p>🔒 Private selections until everyone submits</p>
        </div>
      </div>
    </main>
  );
}
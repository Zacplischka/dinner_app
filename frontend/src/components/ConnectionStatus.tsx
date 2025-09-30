// ConnectionStatus component - Badge showing WebSocket connection status
// Based on: specs/001-dinner-decider-enables/tasks.md T059

import { useConnectionStatus } from '../stores/sessionStore';

export default function ConnectionStatus() {
  const isConnected = useConnectionStatus();

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`flex items-center space-x-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium ${
          isConnected
            ? 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}
      >
        {/* Connection indicator dot */}
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          } ${isConnected ? 'animate-pulse' : ''}`}
        />

        {/* Status text */}
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  );
}
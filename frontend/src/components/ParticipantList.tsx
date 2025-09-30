// ParticipantList component - Display list of participants in a session
// Based on: specs/001-dinner-decider-enables/tasks.md T057

import type { Participant } from '@dinner-app/shared/types';

interface ParticipantListProps {
  participants: Participant[];
  showSubmissionStatus?: boolean;
}

export default function ParticipantList({
  participants,
  showSubmissionStatus = false,
}: ParticipantListProps) {
  if (participants.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No participants yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {participants.map((participant) => (
        <div
          key={participant.participantId}
          className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
        >
          {/* Avatar */}
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
            {participant.displayName.charAt(0).toUpperCase()}
          </div>

          {/* Name and status */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {participant.displayName}
              {participant.isHost && (
                <span className="ml-2 text-xs text-blue-600 font-semibold">
                  HOST
                </span>
              )}
            </p>
            {showSubmissionStatus && (
              <p className="text-xs text-gray-500">
                {participant.hasSubmitted ? (
                  <span className="text-green-600">✓ Submitted</span>
                ) : (
                  <span className="text-gray-400">Selecting...</span>
                )}
              </p>
            )}
            {participant.isOnline === false && (
              <p className="text-xs text-gray-400">Disconnected</p>
            )}
          </div>

          {/* Connection indicator */}
          <div
            className={`flex-shrink-0 ${
              participant.isOnline === false ? 'text-gray-400' : 'text-green-500'
            }`}
            aria-label={participant.isOnline === false ? 'Disconnected' : 'Online'}
            role="status"
          >
            ●
          </div>
        </div>
      ))}
    </div>
  );
}
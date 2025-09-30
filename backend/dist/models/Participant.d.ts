import type { Participant } from '@dinner-app/shared/types';
export declare function addParticipant(sessionCode: string, participantId: string, displayName: string, isHost?: boolean): Promise<Participant>;
export declare function getParticipant(participantId: string): Promise<Participant | null>;
export declare function listParticipants(sessionCode: string): Promise<Participant[]>;
export declare function countParticipants(sessionCode: string): Promise<number>;
export declare function listParticipantIds(sessionCode: string): Promise<string[]>;
export declare function isParticipantInSession(sessionCode: string, participantId: string): Promise<boolean>;
export declare function markParticipantSubmitted(participantId: string): Promise<void>;
export declare function removeParticipant(sessionCode: string, participantId: string): Promise<void>;
//# sourceMappingURL=Participant.d.ts.map
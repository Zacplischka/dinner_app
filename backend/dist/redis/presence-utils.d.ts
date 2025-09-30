export declare function markParticipantOnline(sessionCode: string, participantId: string): Promise<void>;
export declare function markParticipantOffline(sessionCode: string, participantId: string): Promise<void>;
export declare function isParticipantOnline(sessionCode: string, participantId: string): Promise<boolean>;
export declare function getOnlineParticipants(sessionCode: string): Promise<string[]>;
export declare function getParticipantsOnlineStatus(sessionCode: string, participantIds: string[]): Promise<Record<string, boolean>>;
export declare function clearOnlineParticipants(sessionCode: string): Promise<void>;
//# sourceMappingURL=presence-utils.d.ts.map
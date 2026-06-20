export declare function submitSelections(sessionCode: string, participantId: string, optionIds: string[]): Promise<void>;
export declare function getSelections(sessionCode: string, participantId: string): Promise<string[]>;
export declare function getAllSelections(sessionCode: string, participantIds: string[]): Promise<Record<string, string[]>>;
export declare function hasSubmitted(sessionCode: string, participantId: string): Promise<boolean>;
export declare function getSubmittedCount(sessionCode: string, participantIds: string[]): Promise<number>;
export declare function clearSelections(sessionCode: string, participantId: string): Promise<void>;
export declare function clearAllSelections(sessionCode: string, participantIds: string[]): Promise<void>;
//# sourceMappingURL=Selection.d.ts.map
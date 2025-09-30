import type { Socket, Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SelectionSubmitPayload, SelectionSubmitResponse } from '@dinner-app/shared/types';
export declare function handleSelectionSubmit(socket: Socket<ClientToServerEvents, ServerToClientEvents>, io: Server<ClientToServerEvents, ServerToClientEvents>, payload: SelectionSubmitPayload, callback: (response: SelectionSubmitResponse) => void): Promise<void>;
//# sourceMappingURL=submitHandler.d.ts.map
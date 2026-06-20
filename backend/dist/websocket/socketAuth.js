export function setSocketUser(socket, user) {
    socket.data.user = user;
}
export function getSocketUser(socket) {
    return socket.data.user;
}
export function getSocketAuthToken(auth) {
    if (!auth || typeof auth !== 'object' || !('token' in auth)) {
        return undefined;
    }
    const token = auth.token;
    return typeof token === 'string' ? token : undefined;
}
//# sourceMappingURL=socketAuth.js.map
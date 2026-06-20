export function getAuthProfileDefaults(metadata, email) {
    return {
        displayName: getMetadataString(metadata, 'full_name') ??
            getMetadataString(metadata, 'name') ??
            getEmailName(email) ??
            'User',
        avatarUrl: getMetadataString(metadata, 'avatar_url') ??
            getMetadataString(metadata, 'picture') ??
            null,
    };
}
function getMetadataString(metadata, key) {
    if (!metadata || typeof metadata !== 'object') {
        return undefined;
    }
    const value = metadata[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function getEmailName(email) {
    const name = email?.split('@')[0];
    return name && name.length > 0 ? name : undefined;
}
//# sourceMappingURL=authMetadata.js.map
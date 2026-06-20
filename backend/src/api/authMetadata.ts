type AuthProfileDefaults = {
  displayName: string;
  avatarUrl: string | null;
};

export function getAuthProfileDefaults(
  metadata: unknown,
  email: string | undefined
): AuthProfileDefaults {
  return {
    displayName:
      getMetadataString(metadata, 'full_name') ??
      getMetadataString(metadata, 'name') ??
      getEmailName(email) ??
      'User',
    avatarUrl:
      getMetadataString(metadata, 'avatar_url') ??
      getMetadataString(metadata, 'picture') ??
      null,
  };
}

function getMetadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getEmailName(email: string | undefined): string | undefined {
  const name = email?.split('@')[0];
  return name && name.length > 0 ? name : undefined;
}

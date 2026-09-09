import { profileAvatarUrl } from '../services/profilePhoto.js';

type AuthProfileDefaults = {
  displayName: string;
  avatarUrl: string | null;
};

export function getAuthProfileDefaults(
  metadata: unknown,
  email: string | undefined
): AuthProfileDefaults {
  const avatar =
    getMetadataString(metadata, 'avatar_url') ?? getMetadataString(metadata, 'picture') ?? null;
  return {
    displayName:
      getMetadataString(metadata, 'full_name') ??
      getMetadataString(metadata, 'name') ??
      getEmailName(email) ??
      'User',
    avatarUrl: avatar?.startsWith('https://') ? profileAvatarUrl('', avatar) : null,
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

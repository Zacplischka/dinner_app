import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function associations({ APPLE_TEAM_ID, IOS_APP_ID, ANDROID_APP_ID, ANDROID_CERT_SHA256 }) {
  if (!/^[A-Z0-9]{10}$/.test(APPLE_TEAM_ID ?? '')) throw new Error('Provide the Apple Team ID');
  for (const id of [IOS_APP_ID, ANDROID_APP_ID]) {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(id ?? ''))
      throw new Error('Provide both application IDs');
  }
  const fingerprints = (ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase());
  if (!fingerprints.every((value) => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) {
    throw new Error('Provide SHA-256 signing certificate fingerprints, separated by commas');
  }
  return {
    'apple-app-site-association': {
      applinks: {
        details: [
          {
            appID: `${APPLE_TEAM_ID}.${IOS_APP_ID}`,
            paths: ['/join', '/session/*', '/list/*', '/auth/callback'],
          },
        ],
      },
    },
    'assetlinks.json': [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_APP_ID,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destination = resolve(process.argv[2] ?? 'output/mobile/associations');
  const files = associations(process.env);
  await mkdir(destination, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    await writeFile(resolve(destination, name), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(`Association files prepared in ${destination}`);
}

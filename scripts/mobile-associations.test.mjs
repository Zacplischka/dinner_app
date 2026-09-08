import { test } from 'node:test';
import assert from 'node:assert/strict';
import { associations } from './mobile-associations.mjs';

test('associations require real identity inputs and carry only the supported routes', () => {
  const input = {
    APPLE_TEAM_ID: 'TESTTEAM12',
    IOS_APP_ID: 'it.com.dinder.app.dev',
    ANDROID_APP_ID: 'it.com.dinder.app.dev',
    ANDROID_CERT_SHA256: Array(32).fill('AB').join(':'),
  };
  const files = associations(input);
  assert.equal(files['assetlinks.json'][0].target.package_name, input.ANDROID_APP_ID);
  assert.deepEqual(files['apple-app-site-association'].applinks.details[0].paths, [
    '/join',
    '/session/*',
    '/list/*',
    '/auth/callback',
  ]);
  assert.throws(() => associations({ ...input, APPLE_TEAM_ID: '' }));
  assert.throws(() => associations({ ...input, ANDROID_CERT_SHA256: 'upload-key-alias' }));
});

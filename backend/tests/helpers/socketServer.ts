import type { AddressInfo } from 'net';
import { httpServer } from '../../src/server.js';

export async function startSocketServer(): Promise<string> {
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
  }

  const address = httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export async function stopSocketServer(): Promise<void> {
  if (!httpServer.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

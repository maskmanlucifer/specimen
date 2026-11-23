import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import S3rver from 's3rver';
import { v2 as webdav } from 'webdav-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorage } from './local';
import { testStorage } from './registry';
import { S3Storage } from './s3';
import { dec, enc, type StorageAdapter } from './types';
import { WebDavStorage } from './webdav';

/**
 * Runs the same contract against every adapter that has a local server:
 * a real folder, an S3 protocol server (s3rver) and a WebDAV server (webdav-server).
 * OAuth adapters (Drive, Dropbox, OneDrive) need live accounts and are not covered here.
 */
function contract(name: string, make: () => StorageAdapter) {
  describe(name, () => {
    it('writes, reads, lists nested paths and removes folders', async () => {
      const a = make();
      await a.write('board-a/board.json', enc.encode('{"x":1}'), 'application/json');
      await a.write('board-a/media/clip 01.mp3', new Uint8Array([1, 2, 3]));
      expect(dec.decode((await a.read('board-a/board.json'))!)).toBe('{"x":1}');
      expect([...(await a.read('board-a/media/clip 01.mp3'))!]).toEqual([1, 2, 3]);
      const root = await a.list('');
      expect(root.find((e) => e.name === 'board-a')?.isDir).toBe(true);
      const media = await a.list('board-a/media');
      expect(media).toEqual([expect.objectContaining({ name: 'clip 01.mp3', isDir: false, size: 3 })]);
      expect(await a.read('board-a/missing.json')).toBeNull();
      expect(await a.list('nope')).toEqual([]);
      await a.remove('board-a');
      expect(await a.read('board-a/board.json')).toBeNull();
    });

    it('passes the connection test', async () => {
      expect(await testStorage(make(), 'local')).toMatchObject({ ok: true, checks: { read: true, write: true, list: true } });
    });

    it('refuses paths that escape the root', async () => {
      await expect(make().read('../etc/passwd')).rejects.toThrow(/Invalid path/);
    });
  });
}

let tmp: string;
let s3: S3rver;
let s3Port = 0;
let dav: webdav.WebDAVServer;
let davPort = 0;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'specimen-adapters-'));
  s3 = new S3rver({ port: 0, address: '127.0.0.1', silent: true, directory: path.join(tmp, 's3'), configureBuckets: [{ name: 'research', configs: [] }] });
  s3Port = ((await s3.run()) as AddressInfo).port;
  const users = new webdav.SimpleUserManager();
  const user = users.addUser('u', 'p', false);
  const privileges = new webdav.SimplePathPrivilegeManager();
  privileges.setRights(user, '/', ['all']);
  dav = new webdav.WebDAVServer({ port: 0, httpAuthentication: new webdav.HTTPBasicAuthentication(users, 'test'), privilegeManager: privileges });
  await new Promise<void>((r) => dav.start((srv) => ((davPort = (srv?.address() as AddressInfo).port), r())));
});
afterAll(async () => {
  await s3.close();
  await new Promise<void>((r) => dav.stop(() => r()));
  await fs.rm(tmp, { recursive: true, force: true });
});

contract('LocalStorage', () => new LocalStorage(path.join(tmp, 'local')));
contract('S3Storage (s3rver)', () => new S3Storage({ endpoint: `http://127.0.0.1:${s3Port}`, bucket: 'research', region: 'auto', accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER', prefix: 'Specimen' }));
contract('WebDavStorage (webdav-server)', () => new WebDavStorage({ endpoint: `http://127.0.0.1:${davPort}`, username: 'u', password: 'p', prefix: 'Specimen' }));

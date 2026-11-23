/** Minimal types for the s3rver test server (the package ships none). */
declare module 's3rver' {
  import type { AddressInfo } from 'node:net';
  export default class S3rver {
    constructor(opts: { port?: number; address?: string; silent?: boolean; directory: string; configureBuckets?: { name: string; configs: unknown[] }[] });
    run(): Promise<AddressInfo>;
    close(): Promise<void>;
  }
}

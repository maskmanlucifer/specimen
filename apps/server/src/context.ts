import type { Auth } from './auth';
import type { Boards } from './boards';
import type { Config } from './config';
import type { Plugins } from './plugins';
import type { Publisher } from './publish';
import type { StorageRegistry } from './storage/registry';
import type { Store } from './store';

/** Services shared by every route module. Built once in `index.ts`. */
export interface Ctx {
  cfg: Config;
  store: Store;
  auth: Auth;
  storages: StorageRegistry;
  boards: Boards;
  plugins: Plugins;
  publisher: Publisher;
}

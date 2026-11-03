import path from 'node:path';
import {readJson} from './storage.js';
import {accountPrincipal} from './account-identity.js';

// Only the explicitly selected profile is inspected. Never implicitly read a
// desktop login, global rules, global skills, or another application's secrets.
export function principal(directory) {
  if (!directory) return null;
  return accountPrincipal(readJson(path.join(directory, 'auth.json'), {}).tokens?.account_id);
}

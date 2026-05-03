import { readFile } from '../engine/io.js';
import type { CollectSpec, CustomAction } from './types.js';

const httpAlert: CustomAction = {
  type: 'custom',
  run: async (filePath: string) => {
    const alertUrl = process.env['ALERT_URL'];
    if (!alertUrl) return;
    const content = await readFile(filePath);
    const alertToken = process.env['ALERT_TOKEN'];
    const headers: Record<string, string> = { 'Content-Type': 'text/markdown' };
    if (alertToken) headers['Authorization'] = `Bearer ${alertToken}`;
    await fetch(alertUrl, { method: 'POST', headers, body: content });
  },
};

export const incompleteTaskAlertSpec: CollectSpec = {
  name: 'incompleteTaskAlert',
  sources: [{ type: 'glob', pattern: '**/*.md' }],
  predicate: { type: 'unchecked' },
  outputFile: 'tmp_alert.md',
  action: httpAlert,
};

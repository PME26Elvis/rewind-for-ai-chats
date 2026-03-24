import fs from 'fs';
import { detectImportSources, executeImport } from './packages/core/src/import/pipeline.js';

const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf8');
const file = { sourceName: filePath.split('/').pop(), sourceKind: /\.(mhtml|mht|html?)$/i.test(filePath) ? 'html' : 'json', content };

const repo = {
  accounts:new Map(), conversations:new Map(), branches:new Map(), messages:new Map(), jobs:new Map(),
  upsertAccount(a){const inserted=!this.accounts.has(a.id); this.accounts.set(a.id,a); return {inserted,id:a.id}},
  upsertConversation(c){const inserted=!this.conversations.has(c.id); this.conversations.set(c.id,c); return {inserted,id:c.id}},
  upsertBranch(b){const inserted=!this.branches.has(b.id); this.branches.set(b.id,b); return {inserted,id:b.id}},
  upsertMessage(m){const inserted=!this.messages.has(m.id); this.messages.set(m.id,m); return {inserted,id:m.id}},
  insertImportJob(j){this.jobs.set(j.id,j)}, updateImportJob(id,p){this.jobs.set(id,{...(this.jobs.get(id)||{}),...p})},
  listLibraryConversations(){ return [...this.conversations.values()];}
};

console.time('detect');
const d = detectImportSources([file]);
console.timeEnd('detect');
console.log('detected', d.reviewRows[0]);
console.time('execute');
const r = executeImport(repo,[file]);
console.timeEnd('execute');
console.log('result', r);

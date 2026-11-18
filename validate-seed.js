'use strict';
const fs = require('fs');
const path = require('path');
const { seedHsk6XanhLaPapers } = require('./hsk6-xanhla-seed');
const seen = new Set();
let category = null;
let insertCalls = 0;
async function mockDb(sql, params=[]) {
  if (/SELECT id FROM test_categories/i.test(sql)) return { rows: category ? [{ id: category }] : [] };
  if (/INSERT INTO test_categories/i.test(sql)) { category = params[0]; return { rows: [{ id: category }], rowCount: 1 }; }
  if (/INSERT INTO practice_tests/i.test(sql)) {
    insertCalls++;
    const key = `${params[1]}:${params[2]}:${params[3]}`;
    if (seen.has(key)) return { rowCount: 0, command: 'INSERT' };
    seen.add(key); return { rowCount: 1, command: 'INSERT' };
  }
  throw new Error('Unexpected SQL in validator: ' + sql.slice(0,80));
}
(async()=>{
  await seedHsk6XanhLaPapers({dbQuery:mockDb,DATA_DIR:path.join(__dirname,'data')});
  const first=seen.size;
  await seedHsk6XanhLaPapers({dbQuery:mockDb,DATA_DIR:path.join(__dirname,'data')});
  const second=seen.size;
  const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'data/hsk6_xanh_la_seed.json'),'utf8'));
  if(first!==30 || second!==30 || pack.tests.length!==30) throw new Error(`Unexpected counts: first=${first} second=${second} tests=${pack.tests.length}`);
  console.log(`PASS: ${first} inserted once; second seed skipped duplicates; total seed rows ${pack.tests.length}.`);
})().catch(e=>{console.error(e);process.exit(1)});

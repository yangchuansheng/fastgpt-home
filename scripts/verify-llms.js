#!/usr/bin/env node
/** Verify the generated LLM context exposes the Customers terminal set. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function verifyLlms(root = path.resolve(__dirname, '..')) {
  const llms = fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8');
  const customerLinks = [
    ...llms.matchAll(/^\- .+: (https:\/\/fastgpt\.cn\/customers\/[^\s]+)$/gm)
  ].map((match) => match[1]);

  assert.equal((llms.match(/^## Customer Case Center$/gm) || []).length, 1);
  assert(llms.includes('- Customer Case Center: https://fastgpt.cn/customers'));
  assert.equal(new Set(customerLinks).size, 89);
  assert(
    customerLinks.every((url) =>
      /^https:\/\/fastgpt\.cn\/customers\/[a-z0-9-]+\/[a-z0-9-]+$/.test(url)
    )
  );
  return { customerLinks: customerLinks.length };
}

if (require.main === module) {
  try {
    const result = verifyLlms();
    console.log(`LLM context verified: Customers hub plus ${result.customerLinks} detail URLs`);
  } catch (error) {
    console.error(`[verify-llms] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyLlms };

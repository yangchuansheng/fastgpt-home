#!/usr/bin/env node

const { verifyCommittedAuthority } = require('./import-technical-content');

try {
  verifyCommittedAuthority();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

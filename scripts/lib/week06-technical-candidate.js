const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function looseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const block = match?.[1] || '';
  const values = {};
  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { block, body: match ? source.slice(match[0].length) : source, values };
}

const CREDENTIAL_PATTERNS = [
  ['token', /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi],
  ['jwt', /\beyJ[A-Za-z0-9._-]{20,}\b/g],
  ['access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['dsn', /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s`]+/gi],
  [
    'credential-assignment',
    /\b(?:api[_-]?key|access[_-]?token|chat_api_key|token_key|password|secret)\s*[:=]\s*["'`]?[^\s,"'`}]+/gi
  ],
  ['credential-query', /[?&](?:token|key|secret|api[_-]?key|access[_-]?token)=[^&\s)`]+/gi],
  ['auth-header', /\b(?:Authorization|X-[A-Za-z0-9-]*(?:Token|Key))\s*[:=]\s*[^\s,;`)]+/gi]
];

const OPERATION_PATTERNS = [
  ['docker-volume-removal', /docker(?:[- ]compose)?\s+down[^\n`]*-v/gi],
  ['docker-system-prune', /docker\s+system\s+prune/gi],
  ['docker-builder-prune', /docker\s+builder\s+prune/gi],
  ['recursive-delete', /rm\s+-rf[^\n`]*/gi],
  ['persistent-data-delete', /删除[^\n]*(?:持久化数据目录|数据库目录|数据卷|数据目录)/gi],
  ['lockfile-delete', /(?:rm\s+-rf|删除)[^\n]*(?:pnpm-lock|package-lock|yarn\.lock|lockfile)/gi],
  ['cache-delete', /(?:rm\s+-rf|删除)[^\n]*(?:\.next|缓存)/gi],
  ['permission-change', /(?:chmod|chown)\s+[^\n`]*/gi]
];

function redactCredential(value) {
  return String(value)
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_CREDENTIAL]')
    .replace(
      /\b((?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/)[^\s`:@]+:[^\s`@]+@/gi,
      '$1[REDACTED_CREDENTIAL]@'
    )
    .replace(
      /(\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'`]?)[^\s,"'`}]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(
      /([?&](?:token|key|secret|api[_-]?key|access[_-]?token)=)[^&\s)`]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    );
}

function scanPatterns(source, patterns) {
  const matches = [];
  const lines = source.split('\n');
  lines.forEach((line, lineIndex) => {
    patterns.forEach(([kind, pattern]) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        matches.push({ kind, line: lineIndex + 1, raw: match[0] });
      }
    });
  });
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.kind}|${match.line}|${match.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSecurity(source, sourceFile, sourceUrl) {
  const findings = scanPatterns(source, CREDENTIAL_PATTERNS).map((match) => ({
    kind: match.kind,
    location: { sourceFile, line: match.line },
    fingerprint: sha256(redactCredential(match.raw)),
    disposition: 'redacted',
    reviewer: 'technical-governance',
    evidence: sourceUrl,
    replacement: '[REDACTED_CREDENTIAL]'
  }));
  return {
    status: findings.length ? 'redacted-secret' : 'clear',
    findings
  };
}

function buildOperationRisk(source, sourceFile, sourceUrl) {
  const findings = scanPatterns(source, OPERATION_PATTERNS);
  const level = findings.some((finding) =>
    ['docker-system-prune', 'docker-volume-removal', 'persistent-data-delete'].includes(
      finding.kind
    )
  )
    ? 'D0'
    : findings.some((finding) =>
        [
          'recursive-delete',
          'permission-change',
          'lockfile-delete',
          'docker-builder-prune'
        ].includes(finding.kind)
      )
    ? 'D1'
    : findings.length
    ? 'D2'
    : 'none';
  const guidance = {
    none: {
      warning: 'No destructive operation identified in the candidate.',
      prerequisite: 'Confirm the documented environment and version before review.',
      rollback: 'Restore the prior technical-content authority snapshot.',
      decision: 'cleared'
    },
    D0: {
      warning: 'The source describes an operation that can affect persistent state.',
      prerequisite: 'Require a verified backup and an approved recovery runbook.',
      rollback: 'Restore the verified backup and keep the operation outside publication.',
      decision: 'denied'
    },
    D1: {
      warning: 'The source describes an operation that can affect a bounded service resource.',
      prerequisite: 'Limit the operation to the named workspace and confirm a recent backup.',
      rollback: 'Restore the prior image or configuration and rerun bounded verification.',
      decision: 'safeguarded'
    },
    D2: {
      warning: 'The source describes a reproducible cache or generated-artifact operation.',
      prerequisite: 'Confirm the target is regenerable and record the rebuild result.',
      rollback: 'Rebuild the generated artifact from the pinned source revision.',
      decision: 'safeguarded'
    }
  }[level];
  return {
    level,
    ...guidance,
    findings: findings.map((finding) => ({
      kind: finding.kind,
      location: { sourceFile, line: finding.line },
      fingerprint: sha256(redactCredential(finding.raw)),
      evidence: sourceUrl,
      disposition: level === 'D0' ? 'denied' : level === 'none' ? 'cleared' : 'safeguarded'
    }))
  };
}

function buildEvidence(title, source, sourceUrl, sourceType, pageType) {
  const fingerprint = redactCredential(
    source
      .replace(/^---[\s\S]*?---\s*/m, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
  );
  return {
    status: sourceUrl ? 'verified' : 'needs-evidence',
    sources: sourceUrl ? [sourceUrl] : [],
    fingerprint: fingerprint || title,
    applicability: `${sourceType} ${pageType} content; verify the target FastGPT version before use.`
  };
}

function classifySource(category, sourceType) {
  if (category === 'compare') return 'comparison-kb';
  if (sourceType.includes('GitHub')) return 'github-issue';
  if (sourceType.includes('错误码')) return 'open-source-error-code';
  if (sourceType.includes('升级')) return 'official-upgrade-note';
  if (sourceType.includes('术语')) return 'supported-glossary-source';
  return 'official-document';
}

module.exports = {
  buildEvidence,
  buildOperationRisk,
  buildSecurity,
  classifySource,
  looseFrontMatter
};

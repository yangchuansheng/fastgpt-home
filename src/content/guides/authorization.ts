import { createHash } from 'node:crypto';
import authorization from './authorization.json';
import releaseGates from './release-gates.json';
import type { GuideEntry } from './registry';

export const GUIDE_AUTHORIZATION_REQUIRED_SLUGS = [
  'finance-research-retrieval',
  'finance-daily-report-automation'
] as const;
export const GUIDE_G2_REQUIRED_SLUGS = ['soe-policy-qa-deployment'] as const;
export const GUIDE_G2_APPROVALS = ['product', 'legalCompliance'] as const;
export const GUIDE_G2_APPROVAL_SCOPES = {
  product: ['deployment', 'data-flow', 'review', 'audit', 'operations'],
  legalCompliance: ['soe-use', 'data-export', 'regulatory-review', 'private-deployment']
} as const;

export type GuideAuthorizationStatus = 'publishable' | 'release-blocked';

export interface GuideAuthorizationEvidence {
  status: string;
  reference: string;
  digest: string;
}

export interface GuideReleaseEvidence extends GuideAuthorizationEvidence {
  expiresOn: string;
  scope: string[];
}

interface GuideGateEvidence {
  status?: string;
  reference?: string | null;
  digest?: string | null;
  expiresOn?: string | null;
  scope?: string[];
}

export interface GuideAuthorizationCase {
  id: string;
  label: string;
  evidence: GuideAuthorizationEvidence;
}

export interface GuideAuthorizationAsset {
  id: string;
  path: string;
  alt: string;
  evidence: GuideAuthorizationEvidence;
}

export interface GuideAuthorizationRecord {
  requiredCases: GuideAuthorizationCase[];
  requiredAssets: GuideAuthorizationAsset[];
}

export interface GuideAuthorizationDecision {
  slug: string;
  status: GuideAuthorizationStatus;
  eligible: boolean;
  blockers: string[];
  requiredCases: number;
  requiredAssets: number;
}

type GuideAuthorizationDecisionMap =
  | Map<string, GuideAuthorizationDecision>
  | Record<string, GuideAuthorizationDecision>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHORITY_RECORDS = authorization as unknown as {
  schemaVersion?: number;
  requiredSlugs?: string[];
  records?: Record<string, GuideAuthorizationRecord>;
};
const RELEASE_GATES = releaseGates as {
  schemaVersion?: number;
  entries?: Record<
    string,
    {
      group?: string;
      status?: string;
      approvals?: Record<string, GuideGateEvidence>;
      evidence?: Record<string, GuideGateEvidence>;
      ownerApproval?: GuideGateEvidence;
      productEvidence?: GuideGateEvidence;
      legalComplianceEvidence?: GuideGateEvidence;
      blockers?: string[];
    }
  >;
};
const AUTHORITY_SHAPE_IS_VALID =
  AUTHORITY_RECORDS.schemaVersion === 1 &&
  Array.isArray(AUTHORITY_RECORDS.requiredSlugs) &&
  AUTHORITY_RECORDS.requiredSlugs.join('\u0000') ===
    GUIDE_AUTHORIZATION_REQUIRED_SLUGS.join('\u0000') &&
  Boolean(AUTHORITY_RECORDS.records);

function isRequiredSlug(slug: string): boolean {
  return GUIDE_AUTHORIZATION_REQUIRED_SLUGS.includes(
    slug as (typeof GUIDE_AUTHORIZATION_REQUIRED_SLUGS)[number]
  );
}

function isG2Slug(slug: string): boolean {
  return GUIDE_G2_REQUIRED_SLUGS.includes(slug as (typeof GUIDE_G2_REQUIRED_SLUGS)[number]);
}

function releaseGateFor(slug: string) {
  return RELEASE_GATES.schemaVersion === 1 ? RELEASE_GATES.entries?.[slug] : undefined;
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function isGuideIsoDate(value: unknown): value is `${number}-${number}-${number}` {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function addBlocker(blockers: string[], category: string, id: string, reason: string) {
  blockers.push(`${category} ${id}: ${reason}`);
}

function validateEvidence(
  evidence: GuideGateEvidence | GuideAuthorizationEvidence | undefined,
  category: string,
  id: string,
  blockers: string[],
  options: { expiresOn?: boolean; scope?: readonly string[]; asOf?: string } = {}
) {
  if (!evidence || typeof evidence !== 'object') {
    addBlocker(blockers, category, id, 'missing evidence record');
    return;
  }
  if (evidence.status !== 'valid') {
    addBlocker(blockers, category, id, `evidence status is ${evidence.status || 'missing'}`);
  }
  if (typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
    addBlocker(blockers, category, id, 'evidence reference is missing');
  }
  if (typeof evidence.digest !== 'string' || !SHA256_PATTERN.test(evidence.digest)) {
    addBlocker(blockers, category, id, 'evidence digest must be a SHA-256 value');
  } else if (
    typeof evidence.reference === 'string' &&
    evidence.reference.trim() &&
    evidence.digest !== createHash('sha256').update(evidence.reference.trim()).digest('hex')
  ) {
    addBlocker(blockers, category, id, 'evidence digest does not match its reference');
  }
  if (options.expiresOn) {
    if (!isGuideIsoDate((evidence as GuideGateEvidence)?.expiresOn)) {
      addBlocker(blockers, category, id, 'evidence expiry must be a valid ISO date');
    } else if ((evidence as GuideGateEvidence).expiresOn! < (options.asOf || currentUtcDate())) {
      addBlocker(blockers, category, id, 'evidence has expired');
    }
  }
  if (options.scope) {
    const scope = (evidence as GuideGateEvidence)?.scope;
    if (!Array.isArray(scope) || options.scope.some((item) => !scope.includes(item))) {
      addBlocker(blockers, category, id, 'evidence scope is incomplete');
    }
  }
}

function releaseEvidenceFor(
  gate: ReturnType<typeof releaseGateFor>,
  approval: (typeof GUIDE_G2_APPROVALS)[number]
) {
  const source = gate?.approvals || gate?.evidence;
  if (source?.[approval]) return source[approval];
  if (approval === 'product' && gate?.productEvidence) return gate.productEvidence;
  if (approval === 'legalCompliance') return gate?.legalComplianceEvidence || source?.legal;
  return undefined;
}

export function evaluateGuideReleaseGate(
  slug: string,
  gate: ReturnType<typeof releaseGateFor> = releaseGateFor(slug),
  { asOf = currentUtcDate() }: { asOf?: string } = {}
): GuideAuthorizationDecision {
  if (!isG2Slug(slug)) {
    return {
      slug,
      status: 'publishable',
      eligible: true,
      blockers: [],
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const blockers: string[] = [];
  if (!gate || gate.group !== 'G2') {
    addBlocker(blockers, 'release gate', slug, 'G2 classification is missing');
  } else {
    for (const approval of GUIDE_G2_APPROVALS) {
      validateEvidence(releaseEvidenceFor(gate, approval), 'release approval', approval, blockers, {
        expiresOn: true,
        scope: GUIDE_G2_APPROVAL_SCOPES[approval],
        asOf
      });
    }
  }
  return {
    slug,
    status: blockers.length ? 'release-blocked' : 'publishable',
    eligible: blockers.length === 0,
    blockers,
    requiredCases: 0,
    requiredAssets: 0
  };
}

/** Evaluate the case and asset evidence required before a finance Guide is projected. */
export function evaluateGuideAuthorization(
  slug: string,
  record: Partial<GuideAuthorizationRecord> | undefined
): GuideAuthorizationDecision {
  if (isG2Slug(slug)) return evaluateGuideReleaseGate(slug);
  if (!isRequiredSlug(slug)) {
    return {
      slug,
      status: 'publishable',
      eligible: true,
      blockers: [],
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const blockers: string[] = [];
  if (!record || typeof record !== 'object') {
    addBlocker(blockers, 'authorization', slug, 'record is missing');
    return {
      slug,
      status: 'release-blocked',
      eligible: false,
      blockers,
      requiredCases: 0,
      requiredAssets: 0
    };
  }

  const requiredCases = Array.isArray(record.requiredCases) ? record.requiredCases : [];
  const requiredAssets = Array.isArray(record.requiredAssets) ? record.requiredAssets : [];
  if (!requiredCases.length) addBlocker(blockers, 'case', slug, 'required case list is empty');
  if (!requiredAssets.length) addBlocker(blockers, 'asset', slug, 'required asset list is empty');

  const seenCases = new Set<string>();
  for (const item of requiredCases) {
    const id = typeof item?.id === 'string' ? item.id : 'unknown-case';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'case', id, 'invalid case identifier');
    if (seenCases.has(id)) addBlocker(blockers, 'case', id, 'duplicate case identifier');
    seenCases.add(id);
    if (typeof item?.label !== 'string' || !item.label.trim()) {
      addBlocker(blockers, 'case', id, 'case label is missing from authority');
    }
    validateEvidence(item?.evidence, 'case', id, blockers);
  }

  const seenAssets = new Set<string>();
  for (const item of requiredAssets) {
    const id = typeof item?.id === 'string' ? item.id : 'unknown-asset';
    if (!SAFE_ID_PATTERN.test(id)) addBlocker(blockers, 'asset', id, 'invalid asset identifier');
    if (seenAssets.has(id)) addBlocker(blockers, 'asset', id, 'duplicate asset identifier');
    seenAssets.add(id);
    if (
      typeof item?.path !== 'string' ||
      !item.path.startsWith('/') ||
      item.path.includes('..') ||
      typeof item.alt !== 'string' ||
      !item.alt.trim()
    ) {
      addBlocker(blockers, 'asset', id, 'asset path or alt text is missing');
    }
    validateEvidence(item?.evidence, 'asset', id, blockers);
  }

  return {
    slug,
    status: blockers.length ? 'release-blocked' : 'publishable',
    eligible: blockers.length === 0,
    blockers,
    requiredCases: requiredCases.length,
    requiredAssets: requiredAssets.length
  };
}

function decisionFor(
  decisions: GuideAuthorizationDecisionMap,
  slug: string
): GuideAuthorizationDecision | undefined {
  return decisions instanceof Map ? decisions.get(slug) : decisions[slug];
}

/** Filter the public Guide registry using an explicit authorization decision map. */
export function projectGuideEntries(
  entries: GuideEntry[],
  decisions: GuideAuthorizationDecisionMap = guideAuthorizationDecisions
): GuideEntry[] {
  return entries.filter(
    (entry) =>
      (!isRequiredSlug(entry.slug) && !isG2Slug(entry.slug)) ||
      (decisionFor(decisions, entry.slug) || evaluateGuideAuthorization(entry.slug, undefined))
        ?.eligible === true
  );
}

export const guideAuthorizationDecisions: Record<string, GuideAuthorizationDecision> =
  Object.fromEntries(
    [...GUIDE_AUTHORIZATION_REQUIRED_SLUGS, ...GUIDE_G2_REQUIRED_SLUGS].map((slug) => [
      slug,
      evaluateGuideAuthorization(
        slug,
        AUTHORITY_SHAPE_IS_VALID ? AUTHORITY_RECORDS.records?.[slug] : undefined
      )
    ])
  );

export function getGuideAuthorizationDecision(slug: string): GuideAuthorizationDecision {
  return guideAuthorizationDecisions[slug] || evaluateGuideAuthorization(slug, undefined);
}

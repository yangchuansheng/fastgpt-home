function getSourceNodeSteps() {
  return [
    [
      'solutions-preview.regression',
      'Solutions preview runner regression',
      'scripts/lib/solutions-preview-http.test.js',
      []
    ],
    ['seo-basics.regression', 'SEO basics regression', 'scripts/verify-seo-basics.test.js', []],
    [
      'content-hygiene.source',
      'content hygiene source verification',
      'scripts/verify-content-hygiene.js',
      ['--mode', 'source']
    ],
    [
      'guide-release.source',
      'G1 Guide release evidence source verification',
      'scripts/verify-guide-release.js',
      []
    ],
    [
      'guide-g2-release.source',
      'G2 Guide release evidence source verification',
      'scripts/verify-guide-g2-release.js',
      []
    ],
    [
      'faq-route-registry.source',
      'route registry check',
      'scripts/generate-faq-route-registry.js',
      ['--check']
    ],
    [
      'faq-metadata-snapshot.source',
      'metadata snapshot check',
      'scripts/generate-faq-metadata.js',
      ['--check']
    ],
    ['faq-routes.source', 'FAQ route source verification', 'scripts/verify-faq-routes.js', []],
    [
      'faq-metadata-legacy.source',
      'FAQ metadata source verification',
      'scripts/verify-faq-metadata.js',
      []
    ],
    [
      'faq-metadata.source',
      'FAQ metadata normalization source verification',
      'scripts/verify-faq-metadata-authority.js',
      []
    ],
    [
      'faq-seo-graph.source',
      'FAQ SEO graph source verification',
      'scripts/verify-faq-seo-graph.js',
      []
    ],
    [
      'url-alias.source',
      'URL Alias Authority source verification',
      'scripts/verify-url-alias-authority.js',
      []
    ],
    [
      'case-only.source',
      'case-only authority and projection source verification',
      'scripts/verify-case-only-aliases.js',
      []
    ],
    [
      'url-alias.rebuilt-source',
      'URL Alias rebuilt-slug authority and projection source verification',
      'scripts/verify-rebuilt-slug-aliases.js',
      []
    ],
    [
      'faq-redirects.source',
      'FAQ redirect source verification',
      'scripts/verify-faq-redirects.js',
      ['--source']
    ],
    [
      'technical-authority.source',
      'technical authority source verification',
      'scripts/verify-technical-authority.js',
      []
    ],
    [
      'technical-wave.source',
      'technical wave source verification',
      'scripts/verify-technical-wave.js',
      []
    ],
    [
      'technical-wave2.source',
      'technical wave 2 source verification',
      'scripts/verify-technical-wave2.js',
      []
    ],
    [
      'technical-full-release-build-decision.source',
      'Technical full-release build decision verification',
      'scripts/verify-technical-full-release-build-decision.js',
      []
    ],
    [
      'technical-full-release-production-switch.source',
      'Technical full-release production switch contract verification',
      'scripts/verify-technical-full-release-production-switch.js',
      []
    ],
    [
      'technical-full-release-approval.source',
      'Technical full-release approval contract verification',
      'scripts/verify-technical-full-release-approval.js',
      []
    ],
    [
      'week06-wave0-readiness.source',
      'Week06 bilingual Technical Wave 0 readiness verification',
      'scripts/verify-week06-wave0-readiness.js',
      []
    ],
    [
      'week06-wave1.source',
      'Week06 bilingual Technical Wave 1 source verification',
      'scripts/verify-week06-wave1.js',
      []
    ],
    [
      'week06-wave1.rollback',
      'Week06 bilingual Technical Wave 1 rollback-on-error verification',
      'scripts/verify-week06-wave1.js',
      ['--rollback-on-error']
    ]
  ];
}

function getSourceNpmSteps() {
  return [
    [
      'technical-content.source',
      'technical content authority verification',
      ['verify:technical-content']
    ],
    [
      'technical-authority.regression',
      'technical authority regression',
      ['verify:technical-authority-regression']
    ],
    [
      'technical-wave.regression',
      'technical wave regression',
      ['verify:technical-wave-regression']
    ],
    [
      'technical-wave2.regression',
      'technical wave 2 regression',
      ['verify:technical-wave2-regression']
    ],
    [
      'technical-full-release-build-decision.regression',
      'Technical full-release build decision regression',
      ['verify:technical-full-release-build-decision-regression']
    ],
    [
      'technical-full-release-production-switch.regression',
      'Technical full-release production switch contract regression',
      ['verify:technical-full-release-production-switch-regression']
    ],
    [
      'technical-full-release-approval.regression',
      'Technical full-release approval contract regression',
      ['verify:technical-full-release-approval-regression']
    ],
    [
      'week06-wave0-readiness.regression',
      'Week06 bilingual Technical Wave 0 readiness regression',
      ['verify:week06-wave0-readiness-regression']
    ],
    [
      'week06-wave1.regression',
      'Week06 bilingual Technical Wave 1 regression',
      ['verify:week06-wave1-regression']
    ],
    [
      'technical-content.regression',
      'technical content regression',
      ['verify:technical-content-regression']
    ],
    [
      'technical-center.regression',
      'technical center regression',
      ['verify:technical-center-regression']
    ],
    [
      'technical-export.regression',
      'technical export regression',
      ['verify:technical-export-regression']
    ],
    [
      'guide-import.regression',
      'Week06 Guide import regression',
      ['verify:guide-import-regression']
    ],
    [
      'guide-release.regression',
      'G1 Guide release evidence regression',
      ['verify:guide-release-regression']
    ],
    [
      'guide-g2-release.regression',
      'G2 Guide release evidence regression',
      ['verify:guide-g2-release-regression']
    ],
    ['url-alias.regression', 'URL Alias Authority regression', ['verify:url-alias-regression']],
    ['case-only.regression', 'case-only slice regression', ['verify:case-only-regression']],
    [
      'url-alias.rebuilt-regression',
      'URL Alias rebuilt-slug slice regression',
      ['verify:rebuilt-slug-regression']
    ],
    [
      'faq-metadata.regression',
      'FAQ metadata normalization regression',
      ['verify:faq-metadata-authority-regression']
    ],
    ['release-readiness.regression', 'release readiness regression', ['verify:release-readiness']]
  ];
}

function extractP1SuccessMeasurement(output) {
  return output.match(
    /P1 verification passed for .*:\s*([0-9.]+ KiB initial JavaScript gzip)/
  )?.[1];
}

function getVariantSteps(variant) {
  const steps = [
    {
      runner: 'node',
      id: 'content-hygiene.html',
      label: `Complete HTML hygiene (${variant})`,
      command: 'scripts/verify-content-hygiene.js',
      args: ['--mode', 'html', '--root', 'out', '--variant', variant]
    },
    {
      runner: 'npm',
      id: 'technical-center.export',
      label: `technical center artifact verification (${variant})`,
      args: ['verify:technical-center']
    },
    {
      runner: 'npm',
      id: 'technical-export.export',
      label: `technical export artifact verification (${variant})`,
      args: ['verify:technical-export']
    },
    {
      runner: 'npm',
      id: 'technical-wave.export',
      label: `technical wave export verification (${variant})`,
      args: ['verify:technical-wave', '--', '--export', '--variant', variant, '--out-dir', 'out']
    },
    {
      runner: 'npm',
      id: 'technical-wave2.export',
      label: `technical wave 2 export verification (${variant})`,
      args: ['verify:technical-wave2', '--', '--export', '--variant', variant, '--out-dir', 'out']
    },
    {
      runner: 'npm',
      id: 'week06-wave1.export',
      label: `Week06 bilingual Technical Wave 1 export verification (${variant})`,
      args: ['verify:week06-wave1', '--', '--export', '--variant', variant, '--out-dir', 'out']
    },
    ...(variant === 'preview'
      ? []
      : [
          {
            runner: 'node',
            id: 'url-alias.blackbox',
            label: `URL Alias black-box verification (${variant})`,
            command: 'scripts/verify-url-alias-blackbox.js',
            args: ['--variant', variant]
          },
          {
            runner: 'node',
            id: 'case-only.http',
            label: `Case-only HTTP verification (${variant})`,
            command: 'scripts/verify-url-alias-blackbox.js',
            args: ['--variant', variant, '--slice', 'case-only']
          }
        ]),
    {
      runner: 'npm',
      id: 'p0.export',
      label: `P0 HTML verification (${variant})`,
      args: ['verify:p0']
    },
    {
      runner: 'npm',
      id: 'p1.export',
      label: `P1 HTML verification (${variant})`,
      args: ['verify:p1'],
      formatSuccess: extractP1SuccessMeasurement
    },
    {
      runner: 'npm',
      id: 'p2.export',
      label: `P2 HTML verification (${variant})`,
      args: ['verify:p2']
    },
    {
      runner: 'npm',
      id: 'i18n-seo.export',
      label: `i18n SEO HTML verification (${variant})`,
      args: ['verify:i18n-seo']
    },
    ...(variant === 'preview'
      ? []
      : [
          {
            runner: 'npm',
            id: 'faq-metadata-legacy.html',
            label: `FAQ metadata HTML verification (${variant})`,
            args: ['verify:faq-metadata', '--', '--html', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-metadata.html',
            label: `FAQ metadata normalization HTML verification (${variant})`,
            args: ['verify:faq-metadata-authority', '--', '--html', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-seo-graph.html',
            label: `FAQ SEO graph HTML verification (${variant})`,
            args: ['verify:faq-seo-graph', '--', '--html', '--out-dir', 'out', '--variant', variant]
          },
          {
            runner: 'npm',
            id: 'faq-redirects.export',
            label: `FAQ redirect artifact verification (${variant})`,
            args: ['verify:faq-redirects']
          }
        ])
  ];
  return steps;
}

module.exports = {
  extractP1SuccessMeasurement,
  getSourceNodeSteps,
  getSourceNpmSteps,
  getVariantSteps
};

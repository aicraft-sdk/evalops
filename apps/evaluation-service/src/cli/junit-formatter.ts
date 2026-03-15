import { Run } from '@evalops/shared-db';
import { PolicyViolation } from '../app/policies/policies.service';

export interface ScenarioRun {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  run: Run;
  violations?: PolicyViolation[];
}

export interface SuiteRunResult {
  suiteId: string;
  suiteName: string;
  commitSha?: string;
  startedAt: Date;
  completedAt: Date;
  scenarios: ScenarioRun[];
}

/**
 * Format suite run results as JUnit XML
 */
export function formatJUnitXML(result: SuiteRunResult): string {
  const totalTests = result.scenarios.length;
  const failures = result.scenarios.filter(
    (s) => s.run.decision === 'fail'
  ).length;
  const warnings = result.scenarios.filter(
    (s) => s.run.decision === 'warn'
  ).length;
  const duration = Math.floor(
    (result.completedAt.getTime() - result.startedAt.getTime()) / 1000
  );

  const testCases = result.scenarios.map((scenario) => {
    const duration = scenario.run.duration || 0;
    const decision = scenario.run.decision || 'pass';

    if (decision === 'fail') {
      const violationMessages =
        scenario.violations?.map((v) => v.message).join('; ') ||
        'Policy violation';
      const violationDetails =
        scenario.violations
          ?.map(
            (v) =>
              `${v.policyName} (${v.severity}): ${v.message}${
                v.evidence ? ` - Evidence: ${JSON.stringify(v.evidence)}` : ''
              }`
          )
          .join('\n') || violationMessages;

      return `    <testcase name="${escapeXml(
        scenario.scenarioName
      )}" classname="${escapeXml(result.suiteName)}" time="${duration}">
      <failure message="${escapeXml(violationMessages)}">
<![CDATA[${violationDetails}]]>
      </failure>
    </testcase>`;
    } else if (decision === 'warn') {
      return `    <testcase name="${escapeXml(
        scenario.scenarioName
      )}" classname="${escapeXml(result.suiteName)}" time="${duration}">
      <skipped message="Policy warning"/>
    </testcase>`;
    } else {
      return `    <testcase name="${escapeXml(
        scenario.scenarioName
      )}" classname="${escapeXml(result.suiteName)}" time="${duration}"/>`;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${escapeXml(
    `Simulation Suite: ${result.suiteName}`
  )}" tests="${totalTests}" failures="${failures}" errors="0" skipped="${warnings}" time="${duration}">
${testCases.join('\n')}
  </testsuite>
</testsuites>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface EcosystemSuiteResult {
  name: string;
  status: 'success' | 'failure' | 'cancelled';
  durationMs?: number;
  logUrl?: string;
  notes?: string;
}

export interface EcosystemCommitRecord {
  commitSha: string;
  commitTimestamp: string;
  commitMessage: string;
  author: {
    name: string;
    email?: string;
    login?: string;
  };
  repository: {
    fullName: string;
    name: string;
  };
  workflowRunUrl: string;
  overallStatus: 'success' | 'failure' | 'cancelled';
  suites: EcosystemSuiteResult[];
}

export type EcosystemCommitHistory = EcosystemCommitRecord[];

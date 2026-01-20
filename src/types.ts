export type PipelineStatus = 'success' | 'failed' | 'warning' | 'pending';
export type ReviewState = 'approved' | 'changes_requested' | 'pending' | 'commented';
export type RepoSource = 'github' | 'gitlab';

export interface User {
  name: string;
  avatarUrl: string;
  username: string; // Added this to help with logic comparison
}

export interface UnifiedPullRequest {
  id: string;
  title: string;
  url: string;
  source: RepoSource;
  repoName: string;
  updatedAt: Date;
  author: User;
  reviewers: User[];
  pipelineStatus: PipelineStatus;
  commentStats: { resolved: number; total: number };
  approvals: { given: number; required: number };
  changes: { files: number; additions: number; deletions: number };
  
  // Logic flags
  isAuthor: boolean;
  isReviewer: boolean;
  myReviewState: ReviewState;
  overallReviewState: ReviewState;
}
import type { UnifiedPullRequest, PipelineStatus, ReviewState } from '../types';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export const fetchGithubPRs = async (token: string, username: string): Promise<UnifiedPullRequest[]> => {
  const query = `
    query {
      search(query: "is:pr is:open involves:${username} archived:false", type: ISSUE, first: 20) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            updatedAt
            repository {
              name
              owner { login }
            }
            author {
              login
              avatarUrl
            }
            reviewRequests(first: 10) {
              nodes {
                requestedReviewer {
                  ... on User { login avatarUrl }
                }
              }
            }
            reviews(first: 10) {
              nodes {
                author { login }
                state
              }
            }
            commits(last: 1) {
              nodes {
                commit {
                  statusCheckRollup {
                    state
                  }
                }
              }
            }
            totalCommentsCount
            changedFiles
            additions
            deletions
            reviewDecision
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const json = await response.json();
  
  if (json.errors) {
    console.error('GitHub API Error:', json.errors);
    throw new Error('Failed to fetch from GitHub');
  }

  return json.data.search.nodes.map((pr: any) => mapGithubToUnified(pr, username));
};

// --- Helper: Mappers ---

function mapGithubToUnified(pr: any, currentUsername: string): UnifiedPullRequest {
  const isAuthor = pr.author.login === currentUsername;

  // 1. Determine Reviewers
  const requestedReviewers = pr.reviewRequests.nodes.map((n: any) => n.requestedReviewer);
  // We also include people who have already reviewed
  const actualReviewers = pr.reviews.nodes.map((n: any) => n.author);
  
  // Deduplicate reviewers by login
  const allReviewersMap = new Map();
  [...requestedReviewers, ...actualReviewers].forEach((r: any) => {
    if (r && r.login && r.login !== pr.author.login) {
      allReviewersMap.set(r.login, {
        name: r.login,
        username: r.login,
        avatarUrl: r.avatarUrl || `https://github.com/${r.login}.png`,
      });
    }
  });
  const reviewers = Array.from(allReviewersMap.values());
  const isReviewer = allReviewersMap.has(currentUsername);

  // 2. Determine Pipeline Status
  let pipelineStatus: PipelineStatus = 'pending';
  const status = pr.commits.nodes[0]?.commit?.statusCheckRollup?.state;
  if (status === 'SUCCESS') pipelineStatus = 'success';
  else if (status === 'FAILURE' || status === 'ERROR') pipelineStatus = 'failed';
  else if (status === 'PENDING') pipelineStatus = 'pending';

  // 3. Determine My Review State
  let myReviewState: ReviewState = 'pending';
  const myReview = pr.reviews.nodes.find((r: any) => r.author?.login === currentUsername);
  if (myReview) {
    if (myReview.state === 'APPROVED') myReviewState = 'approved';
    else if (myReview.state === 'CHANGES_REQUESTED') myReviewState = 'changes_requested';
    else if (myReview.state === 'COMMENTED') myReviewState = 'commented';
  }

  // 4. Overall Review State
  // GitHub gives us 'reviewDecision' (APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED)
  let overallReviewState: ReviewState = 'pending';
  if (pr.reviewDecision === 'APPROVED') overallReviewState = 'approved';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') overallReviewState = 'changes_requested';

  return {
    id: pr.number.toString(),
    title: pr.title,
    url: pr.url,
    source: 'github',
    repoName: pr.repository.name,
    updatedAt: new Date(pr.updatedAt),
    author: {
      name: pr.author.login,
      username: pr.author.login,
      avatarUrl: pr.author.avatarUrl,
    },
    reviewers,
    pipelineStatus,
    commentStats: {
      total: pr.totalCommentsCount,
      resolved: 0, // GitHub API doesn't easily give "resolved" count without complex nesting
    },
    approvals: {
      given: pr.reviewDecision === 'APPROVED' ? 1 : 0, // Simplified
      required: 1, // GitHub doesn't expose "required count" easily in this query
    },
    changes: {
      files: pr.changedFiles,
      additions: pr.additions,
      deletions: pr.deletions,
    },
    isAuthor,
    isReviewer,
    myReviewState,
    overallReviewState,
  };
}
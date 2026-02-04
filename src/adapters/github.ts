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
            reviewRequests(first: 20) {
              nodes {
                requestedReviewer {
                  ... on User { login avatarUrl }
                }
              }
            }
            reviews(first: 50) {
              nodes {
                author { login avatarUrl }
                state
                submittedAt
              }
            }
            comments(last: 50) {
              nodes {
                author { login avatarUrl }
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

  // 1. Determine Reviewers and their statuses
  const requestedReviewers = (pr.reviewRequests?.nodes || []).map((n: any) => n.requestedReviewer).filter(Boolean);
  const reviewNodes = (pr.reviews?.nodes || []).filter(Boolean);
  const commentNodes = (pr.comments?.nodes || []).filter(Boolean);

  // Build maps for quick lookup
  const approvers = new Map<string, any>();
  const changesRequested = new Map<string, any>();
  const commented = new Map<string, any>();

  reviewNodes.forEach((r: any) => {
    const login = r.author?.login;
    if (!login) return;
    const state = (r.state || '').toUpperCase();
    if (state === 'APPROVED') approvers.set(login, r);
    else if (state === 'CHANGES_REQUESTED') changesRequested.set(login, r);
    else if (state === 'COMMENTED') commented.set(login, r);
  });

  commentNodes.forEach((c: any) => {
    const login = c.author?.login;
    if (!login) return;
    if (!commented.has(login)) commented.set(login, c);
  });

  // Combine requested reviewers, reviewers who've reviewed, and commenters
  const allReviewerUsernames = new Set<string>();
  requestedReviewers.forEach((r: any) => r?.login && allReviewerUsernames.add(r.login));
  reviewNodes.forEach((r: any) => r?.author?.login && allReviewerUsernames.add(r.author.login));
  commentNodes.forEach((c: any) => c?.author?.login && allReviewerUsernames.add(c.author.login));

  const allReviewersMap = new Map<string, any>();
  allReviewerUsernames.forEach((login) => {
    const avatar = (
      requestedReviewers.find((x: any) => x?.login === login)?.avatarUrl ||
      reviewNodes.find((x: any) => x?.author?.login === login)?.author?.avatarUrl ||
      `https://github.com/${login}.png`
    );
    allReviewersMap.set(login, {
      name: login,
      username: login,
      avatarUrl: avatar,
    });
  });

  const reviewers = Array.from(allReviewersMap.values()).map((r: any) => {
    let status: ReviewState = 'pending';
    if (approvers.has(r.username)) status = 'approved';
    else if (changesRequested.has(r.username)) status = 'changes_requested';
    else if (commented.has(r.username)) status = 'commented';
    return { ...r, status };
  });

  const isReviewer = allReviewersMap.has(currentUsername);

  // 2. Determine Pipeline Status
  let pipelineStatus: PipelineStatus = 'pending';
  const status = pr.commits.nodes[0]?.commit?.statusCheckRollup?.state;
  const s = (status || '').toUpperCase();
  if (s.includes('WARN') || s === 'NEUTRAL') pipelineStatus = 'warning';
  else if (s === 'SUCCESS') pipelineStatus = 'success';
  else if (s === 'FAILURE' || s === 'ERROR') pipelineStatus = 'failed';
  else if (s === 'PENDING' || s === 'RUNNING') pipelineStatus = 'pending';

  // 3. Determine My Review State (use latest submitted review if multiple)
  let myReviewState: ReviewState = 'pending';
  const myReviews = reviewNodes.filter((r: any) => r.author?.login === currentUsername);
  if (myReviews.length > 0) {
    // pick latest by submittedAt if available
    myReviews.sort((a: any, b: any) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    const latest = myReviews[0];
    const st = (latest.state || '').toUpperCase();
    if (st === 'APPROVED') myReviewState = 'approved';
    else if (st === 'CHANGES_REQUESTED') myReviewState = 'changes_requested';
    else if (st === 'COMMENTED') myReviewState = 'commented';
  } else if (requestedReviewers.find((r: any) => r?.login === currentUsername)) {
    myReviewState = 'pending';
  }

  // 4. Overall Review State
  let overallReviewState: ReviewState = 'pending';
  if (pr.reviewDecision === 'APPROVED') overallReviewState = 'approved';
  else if (pr.reviewDecision === 'CHANGES_REQUESTED') overallReviewState = 'changes_requested';
  else {
    // Fallback: if any reviewer requested changes, mark as changes_requested
    if (changesRequested.size > 0) overallReviewState = 'changes_requested';
    else if (approvers.size > 0 && pr.reviewDecision === 'APPROVED') overallReviewState = 'approved';
  }

  return {
    id: pr.number.toString(),
    uniqueKey: `${pr.repository.owner.login}/${pr.repository.name}#${pr.number}`,
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
      given: new Set(Array.from(approvers.keys())).size,
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
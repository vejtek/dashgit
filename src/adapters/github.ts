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

  // 1. Gather all data points
  const requestedReviewers = (pr.reviewRequests?.nodes || []).map((n: any) => n.requestedReviewer).filter(Boolean);
  const reviewNodes = (pr.reviews?.nodes || []).filter(Boolean);
  const commentNodes = (pr.comments?.nodes || []).filter(Boolean);

  reviewNodes.sort((a: any, b: any) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  const latestStateByLogin = new Map<string, 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | null>();
  const commentedLogins = new Set<string>();

  reviewNodes.forEach((r: any) => {
    const login = r.author?.login;
    if (!login) return;

    const state = (r.state || '').toUpperCase();

    // Track that this user has interacted at all
    if (state === 'COMMENTED') {
      commentedLogins.add(login);
    } else if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') {
      // These are "binding" states that overwrite previous ones
      latestStateByLogin.set(login, state);
    } else if (state === 'DISMISSED') {
      // If a review is dismissed, their binding state is cleared
      latestStateByLogin.set(login, null);
    }
  });

  // Also track standalone comments (these don't change approval status, just mark as 'commented')
  commentNodes.forEach((c: any) => {
    if (c.author?.login) commentedLogins.add(c.author.login);
  });

  // 3. Build the final maps based on the calculated LATEST state
  const approvers = new Set<string>();
  const changesRequested = new Set<string>();

  latestStateByLogin.forEach((state, login) => {
    if (state === 'APPROVED') approvers.add(login);
    if (state === 'CHANGES_REQUESTED') changesRequested.add(login);
  });

  // 4. Build Reviewer List
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
    
    // Check if currently requested (Priority 1)
    const isRequested = requestedReviewers.some((req: any) => req.login === r.username);

    if (approvers.has(r.username)) {
      status = 'approved';
    } else if (changesRequested.has(r.username)) {
      // If they requested changes, they are red. 
      // UNLESS they were re-requested (isRequested), which usually implies they need to review again.
      // However, usually we want to see the "Changes Requested" badge until they approve.
      // But if we want to mimic the "To Do" logic:
      status = isRequested ? 'pending' : 'changes_requested'; 
    } else if (isRequested) {
      status = 'pending';
    } else if (commentedLogins.has(r.username)) {
      status = 'commented';
    }
    
    return { ...r, status };
  });

  const isReviewer = allReviewersMap.has(currentUsername);

  // 5. Determine Pipeline Status
  let pipelineStatus: PipelineStatus = 'pending';
  const statusCommit = pr.commits.nodes[0]?.commit?.statusCheckRollup?.state;
  const s = (statusCommit || '').toUpperCase();
  if (s.includes('WARN') || s === 'NEUTRAL') pipelineStatus = 'warning';
  else if (s === 'SUCCESS') pipelineStatus = 'success';
  else if (s === 'FAILURE' || s === 'ERROR') pipelineStatus = 'failed';
  else if (s === 'PENDING' || s === 'RUNNING') pipelineStatus = 'pending';

  // 6. Determine My Review State
  let myReviewState: ReviewState = 'pending';
  const amIRequested = requestedReviewers.some((r: any) => r?.login === currentUsername);

  if (amIRequested) {
    myReviewState = 'pending';
  } else {
    // Check my calculated effective state
    const myState = latestStateByLogin.get(currentUsername);
    if (myState === 'APPROVED') myReviewState = 'approved';
    else if (myState === 'CHANGES_REQUESTED') myReviewState = 'changes_requested';
    else if (commentedLogins.has(currentUsername)) myReviewState = 'commented';
  }

  // 7. Overall Review State
  let overallReviewState: ReviewState = 'pending';
  if (pr.reviewDecision === 'APPROVED') overallReviewState = 'approved';
  else if (pr.reviewDecision === 'CHANGES_REQUESTED') overallReviewState = 'changes_requested';
  else {
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
      resolved: 0, 
    },
    approvals: {
      given: approvers.size,
      required: 1, 
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
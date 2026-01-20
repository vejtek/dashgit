import type { UnifiedPullRequest, PipelineStatus, ReviewState } from '../types';

export const fetchGitlabMRs = async (host: string, token: string, userInputUsername: string): Promise<UnifiedPullRequest[]> => {
  const cleanHost = host.replace(/\/$/, '');
  const endpoint = `${cleanHost}/api/graphql`;

  // OPTIMIZED QUERY: Limits set to prevent complexity errors
  const query = `
    fragment MRFields on MergeRequest {
      iid
      title
      webUrl
      updatedAt
      project {
        name
        path
      }
      author {
        username
        avatarUrl
        name
      }
      assignees(first: 5) {
        nodes { username avatarUrl name }
      }
      reviewers(first: 5) {
        nodes { username avatarUrl name }
      }
      headPipeline {
        status
      }
      userPermissions {
        canMerge
      }
      approvedBy(first: 5) {
        nodes { username }
      }
      approvalsRequired
      diffStatsSummary {
        fileCount
        additions
        deletions
      }
      userNotesCount
      discussions(first: 20) {
        nodes { resolvable resolved }
      }
    }

    query {
      currentUser {
        username
        # 1. PRs I created (Newest first)
        authoredMergeRequests(first: 15, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
        # 2. PRs assigned to me (Newest first)
        assignedMergeRequests(first: 15, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
        # 3. PRs requesting my review (Newest first)
        reviewRequestedMergeRequests(first: 15, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
      }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const json = await response.json();

    if (json.errors && !json.data) {
      console.error('GitLab Fatal Error:', json.errors);
      throw new Error(`GitLab GraphQL: ${json.errors[0].message}`);
    }

    const currentUserData = json.data?.currentUser;
    if (!currentUserData) return [];

    const realUsername = currentUserData.username;
    console.log(`[GitLab Adapter] Authenticated as: ${realUsername}`);

    // Deduplicate logic
    const mrMap = new Map();

    const addListToMap = (list: any[]) => {
      if (!list) return;
      list.forEach(mr => {
        // Create a unique key for deduplication
        const uniqueKey = `${mr.project.path}#${mr.iid}`;
        if (!mrMap.has(uniqueKey)) {
          mrMap.set(uniqueKey, mr);
        }
      });
    };

    addListToMap(currentUserData.authoredMergeRequests?.nodes);
    addListToMap(currentUserData.assignedMergeRequests?.nodes);
    addListToMap(currentUserData.reviewRequestedMergeRequests?.nodes);

    const allMrs = Array.from(mrMap.values());

    // Pass the 'cleanHost' to the mapper so we can fix relative avatar URLs
    return allMrs.map((mr: any) => mapGitlabToUnified(mr, realUsername, cleanHost));

  } catch (error: any) {
    console.error('[GitLab Adapter Failed]', error);
    return []; 
  }
};

// --- HELPER: Mapper ---

function mapGitlabToUnified(mr: any, currentUsername: string, baseUrl: string): UnifiedPullRequest {
  const isAuthor = mr.author?.username === currentUsername;

  // Helper to fix avatar URLs
  const resolveAvatar = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // Handle relative URLs (e.g. /uploads/...) by prepending the self-hosted domain
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  // 1. Reviewers
  const reviewersList = [...(mr.reviewers?.nodes || []), ...(mr.assignees?.nodes || [])];
  const uniqueReviewers = Array.from(new Map(reviewersList.map((r:any) => [r.username, r])).values())
    .map((r: any) => ({
      name: r.name,
      username: r.username,
      avatarUrl: resolveAvatar(r.avatarUrl),
    }));
  
  const isReviewer = uniqueReviewers.some(r => r.username === currentUsername);

  // 2. Pipeline Status
  let pipelineStatus: PipelineStatus = 'pending';
  const status = mr.headPipeline?.status?.toLowerCase();
  if (status === 'success') pipelineStatus = 'success';
  else if (status === 'failed') pipelineStatus = 'failed';
  else if (status === 'running' || status === 'pending') pipelineStatus = 'pending';

  // 3. Approvals
  const givenApprovals = mr.approvedBy?.nodes?.length || 0;
  const requiredApprovals = mr.approvalsRequired || 0;
  const hasApproved = mr.approvedBy?.nodes?.some((u: any) => u.username === currentUsername);

  // 4. Comments
  let resolvedCount = 0;
  let totalResolvable = 0;
  if (mr.discussions?.nodes) {
    mr.discussions.nodes.forEach((d: any) => {
      if (d.resolvable) {
        totalResolvable++;
        if (d.resolved) resolvedCount++;
      }
    });
  }

  // 5. State Calculation
  const myReviewState: ReviewState = hasApproved ? 'approved' : 'pending';
  
  let overallReviewState: ReviewState = 'pending';
  if (requiredApprovals > 0 && givenApprovals >= requiredApprovals) {
    overallReviewState = 'approved';
  }

  return {
    // FIX: Composite ID ensures uniqueness across projects (e.g. "group/repo#123")
    id: `${mr.project.path}#${mr.iid}`, 
    title: mr.title,
    url: mr.webUrl,
    source: 'gitlab',
    repoName: mr.project.name,
    updatedAt: new Date(mr.updatedAt),
    author: {
      name: mr.author?.name || 'Unknown',
      username: mr.author?.username || 'unknown',
      avatarUrl: resolveAvatar(mr.author?.avatarUrl),
    },
    reviewers: uniqueReviewers,
    pipelineStatus,
    commentStats: {
      total: mr.userNotesCount || 0,
      resolved: resolvedCount,
    },
    approvals: {
      given: givenApprovals,
      required: requiredApprovals,
    },
    changes: {
      files: mr.diffStatsSummary?.fileCount || 0,
      additions: mr.diffStatsSummary?.additions || 0,
      deletions: mr.diffStatsSummary?.deletions || 0,
    },
    isAuthor,
    isReviewer,
    myReviewState,
    overallReviewState,
  };
}
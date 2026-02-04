import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { UnifiedPullRequest, PipelineStatus, ReviewState, Reviewer } from '../types';

export const fetchGitlabMRs = async (host: string, token: string): Promise<UnifiedPullRequest[]> => {
  const cleanHost = host.replace(/\/$/, '');
  const endpoint = `${cleanHost}/api/graphql`;

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
      # Fetch explicit review state
      reviewers {
        nodes { 
          username 
          avatarUrl 
          name 
          mergeRequestInteraction {
            reviewState
          }
        }
      }
      headPipeline {
        status
        detailedStatus {
          label
        }
      }
      approvedBy(first: 10) {
        nodes { username }
      }
      approvalsRequired
      diffStatsSummary {
        fileCount
        additions
        deletions
      }
      userNotesCount
      discussions(first: 50) {
        nodes { 
          resolvable 
          resolved 
          notes(first: 1) {
            nodes { author { username } }
          }
        }
      }
    }

    query {
      currentUser {
        username
        authoredMergeRequests(first: 20, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
        assignedMergeRequests(first: 20, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
        reviewRequestedMergeRequests(first: 20, state: opened, sort: UPDATED_DESC) {
          nodes { ...MRFields }
        }
      }
    }
  `;

  try {

    // Check if we are running inside Tauri
    const isTauri = !!(window as any).__TAURI_INTERNALS__;

    // Choose the right fetcher
    const myFetch = isTauri ? tauriFetch : fetch;

    const response = await myFetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const json = await response.json();
    if (json.errors) throw new Error(json.errors[0].message);

    const currentUserData = json.data?.currentUser;
    if (!currentUserData) return [];

    const realUsername = currentUserData.username;
    const mrMap = new Map();

    const addList = (list: any[]) => {
      if (!list) return;
      list.forEach(mr => mrMap.set(`${mr.project.path}#${mr.iid}`, mr));
    };

    addList(currentUserData.authoredMergeRequests?.nodes);
    addList(currentUserData.assignedMergeRequests?.nodes);
    addList(currentUserData.reviewRequestedMergeRequests?.nodes);

    return Array.from(mrMap.values()).map((mr: any) => mapGitlabToUnified(mr, realUsername, cleanHost));

  } catch (error) {
    console.error('GitLab Fetch Error', error);
    return [];
  }
};

function mapGitlabToUnified(mr: any, currentUsername: string, baseUrl: string): UnifiedPullRequest {
  const resolveAvatar = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const approvers = new Set(mr.approvedBy?.nodes?.map((u: any) => u.username) || []);
  
  // -- Logic for explicit Review States (from previous step) --
  const rawReviewers = mr.reviewers?.nodes || [];
  const reviewers: Reviewer[] = rawReviewers.map((r: any) => {
    const glState = r.mergeRequestInteraction?.reviewState;
    let status: ReviewState = 'pending';

    if (glState === 'APPROVED') status = 'approved';
    else if (glState === 'REQUESTED_CHANGES') status = 'changes_requested';
    else if (glState === 'REVIEWED') status = 'commented';
    else if (glState === 'UNREVIEWED') status = 'pending';
    
    if (status === 'pending' && approvers.has(r.username)) {
      status = 'approved';
    }

    return {
      name: r.name,
      username: r.username,
      avatarUrl: resolveAvatar(r.avatarUrl),
      status,
    };
  });

  const myReviewerEntry = reviewers.find(r => r.username === currentUsername);
  let myReviewState: ReviewState = myReviewerEntry ? myReviewerEntry.status : 'pending';

  if (myReviewState === 'pending' && approvers.has(currentUsername)) {
    myReviewState = 'approved';
  }

  const givenApprovals = approvers.size;
  const requiredApprovals = mr.approvalsRequired || 0;
  
  const hasRequestedChanges = reviewers.some(r => r.status === 'changes_requested');
  let overallReviewState: ReviewState = 'pending';
  if (hasRequestedChanges) overallReviewState = 'changes_requested';
  else if (requiredApprovals > 0 && givenApprovals >= requiredApprovals) overallReviewState = 'approved';

  // --- FIX START: Correct Comment Stats Calculation ---
  let resolvedCount = 0;
  let totalResolvable = 0;

  if (mr.discussions?.nodes) {
    mr.discussions.nodes.forEach((d: any) => {
      // We ONLY care about discussions that are marked as "resolvable" (threads)
      // This filters out system notes, simple comments, and label changes
      if (d.resolvable) {
        totalResolvable++;
        if (d.resolved) {
          resolvedCount++;
        }
      }
    });
  }

 return {
    id: mr.iid.toString(),
    uniqueKey: `${mr.project.path}#${mr.iid}`,
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
    reviewers,
    // Use detailed label when available to detect "passed with warnings"
    pipelineStatus: mapPipelineStatus(mr.headPipeline?.status, mr.headPipeline?.detailedStatus?.label),
    
    // UPDATED: Use the calculated totals, ignore mr.userNotesCount
    commentStats: { total: totalResolvable, resolved: resolvedCount },
    
    approvals: { given: givenApprovals, required: requiredApprovals },
    changes: {
      files: mr.diffStatsSummary?.fileCount || 0,
      additions: mr.diffStatsSummary?.additions || 0,
      deletions: mr.diffStatsSummary?.deletions || 0,
    },
    isAuthor: mr.author?.username === currentUsername,
    isReviewer: reviewers.some((r) => r.username === currentUsername),
    myReviewState,
    overallReviewState,
  };
}

function mapPipelineStatus(status?: string, detailedLabel?: string): PipelineStatus {
  const label = (detailedLabel || '').toLowerCase();
  const s = (status || '').toLowerCase();

  // Prefer detailed label if present (GitLab may report "passed with warnings" here)
  if (label && (label.includes('warn') || label.includes('with warnings') || label.includes('warning') || label.includes('warnings'))) return 'warning';

  // Fallback to status value
  if (s && (s.includes('warn') || s.includes('with-warnings') || s.includes('with_warnings'))) return 'warning';

  if (s === 'success' || s === 'passed') return 'success';
  if (s === 'failed' || s === 'failure') return 'failed';
  if (s === 'running' || s === 'pending' || s === 'created' || s === 'manual') return 'pending';

  // Unknown / other states -> treat as pending
  return 'pending';
}
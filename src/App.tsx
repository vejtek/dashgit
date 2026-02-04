import { open } from '@tauri-apps/plugin-shell';
import { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileText, 
  Github, 
  Gitlab, 
  ChevronRight, 
  ChevronDown, 
  MessageSquare,
  Settings,
  RefreshCw,
  Check,
  X,
  Loader2
} from 'lucide-react';
import type { UnifiedPullRequest, ReviewState, PipelineStatus } from './types';
import { fetchGitlabMRs } from './adapters/gitlab';
import { fetchGithubPRs } from './adapters/github';

// --- Components ---

// 1. Tiny Status Icon for Reviewers (BOTTOM LEFT)
const StatusBadge = ({ status }: { status: ReviewState }) => {
  const baseClasses = "absolute -bottom-1 -left-1 rounded-full p-0.5 border border-white dark:border-gray-800 z-10";
  
  switch (status) {
    case 'approved':
      return (
        <div className={`${baseClasses} bg-green-500`} title="Approved">
          <Check size={8} className="text-white" strokeWidth={4} />
        </div>
      );
    case 'changes_requested':
      return (
        <div className={`${baseClasses} bg-red-500`} title="Changes Requested">
          <X size={8} className="text-white" strokeWidth={4} />
        </div>
      );
    case 'commented':
      return (
        <div className={`${baseClasses} bg-blue-500`} title="Commented">
          <MessageSquare size={8} className="text-white" fill="currentColor" strokeWidth={0} />
        </div>
      );
    default:
      return null;
  }
};

// 2. Pipeline Icon Logic
const PipelineIcon = ({ status }: { status: PipelineStatus }) => {
  switch (status) {
    case 'success': 
      return <CheckCircle2 size={18} className="text-green-500" />;
    case 'failed': 
      return <XCircle size={18} className="text-red-500" />;
    case 'warning': 
      return <AlertCircle size={18} className="text-yellow-500" />;
    case 'pending': 
      return <Loader2 size={18} className="text-blue-500 animate-spin" />;
    default: 
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
  }
};

// 3. Formatted Relative Time
const RelativeTime = ({ date }: { date: Date }) => {
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  let label = '';
  let color = '';

  if (diffHours < 1) {
    label = `${Math.floor(diffHours * 60)}m`;
    color = 'text-green-600 dark:text-green-400';
  } else if (diffHours < 24) {
    label = `${Math.floor(diffHours)}h`;
    color = 'text-green-600 dark:text-green-400';
  } else if (diffHours < 168) { 
    label = `${Math.floor(diffHours / 24)}d`;
    color = 'text-yellow-600 dark:text-yellow-400';
  } else {
    label = diffHours > 720 ? `${Math.floor(diffHours / 720)}M` : `${Math.floor(diffHours / 24)}d`;
    color = 'text-red-600 dark:text-red-400';
  }

  return <span className={`font-mono font-medium ${color}`}>{label}</span>;
};

// 4. Row Component
const PRRow = ({ pr }: { pr: UnifiedPullRequest }) => {
  const reviewersWithoutAuthor = pr.reviewers.filter(r => r.username !== pr.author.username);

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Last Update */}
      <td className="p-2 text-center whitespace-nowrap">
        <RelativeTime date={pr.updatedAt} />
      </td>

      {/* Pipeline Status */}
      <td className="p-2 text-center">
        <div className="flex justify-center">
          <PipelineIcon status={pr.pipelineStatus} />
        </div>
      </td>

      {/* Title / Repo */}
      <td className="p-2">
        <div className="flex flex-col">
          <a 
            href={pr.url} 
            target="_blank" 
            rel="noreferrer" 
            onClick={async (e) => {
              // Check if running in Tauri
              if ((window as any).__TAURI_INTERNALS__) {
                e.preventDefault(); // Stop the app from navigating internally
                await open(pr.url); // Ask macOS to open the link
              }
              // If not in Tauri (web mode), let the standard target="_blank" work
            }}
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 hover:underline truncate max-w-lg"
          >
            {pr.title} <span className="text-gray-400 font-normal">#{pr.id}</span>
          </a>
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
            {pr.source === 'github' ? <Github size={12} /> : <Gitlab size={12} className="text-orange-600" />}
            <span>{pr.repoName}</span>
          </div>
        </div>
      </td>

      {/* Size */}
      <td className="p-2 whitespace-nowrap">
        <div className="flex flex-col text-xs">
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <FileText size={12} /> {pr.changes.files}
          </div>
          <div className="font-mono">
            <span className="text-green-600">+{pr.changes.additions}</span>
            <span className="text-gray-400 mx-1">/</span>
            <span className="text-red-600">-{pr.changes.deletions}</span>
          </div>
        </div>
      </td>

      {/* Author */}
      <td className="p-2 text-center">
        <div className="flex justify-center group relative">
          <img src={pr.author.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 object-cover" />
          <span className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded z-10 whitespace-nowrap">
            {pr.author.name}
          </span>
        </div>
      </td>

      {/* Reviewers */}
      <td className="p-2">
        <div className="flex -space-x-2 overflow-visible pl-1">
          {reviewersWithoutAuthor.length === 0 ? <span className="text-gray-400 text-xs">-</span> : 
            reviewersWithoutAuthor.map((r, i) => (
              <div key={i} className="group relative transition-transform hover:z-20 hover:scale-105">
                <div className="relative inline-block">
                  <img src={r.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 object-cover" />
                  <StatusBadge status={r.status} />
                </div>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded z-30 whitespace-nowrap">
                  {r.name} ({r.status.replace('_', ' ')})
                </span>
              </div>
            ))
          }
        </div>
      </td>

      {/* Comments (RESTORED ICON) */}
      <td className="p-2 text-xs whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-gray-400" />
          {pr.commentStats.total === 0 ? <span className="text-gray-400">-</span> : 
           pr.commentStats.resolved === pr.commentStats.total ? (
             <span className="text-green-600 font-medium dark:text-green-400">All resolved</span>
           ) : (
             <span className="text-gray-600 dark:text-gray-300">
               {pr.commentStats.resolved} / {pr.commentStats.total}
             </span>
           )}
        </div>
      </td>

      {/* Approvals */}
      <td className="p-2 text-center">
         <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded inline-block">
           <span className={pr.approvals.given >= pr.approvals.required ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
             {pr.approvals.given}
           </span>
           <span className="text-gray-400">/</span>
           <span>{pr.approvals.required}</span>
         </div>
      </td>
    </tr>
  );
};

// 5. Section Container
const Section = ({ title, prs }: { title: string, prs: UnifiedPullRequest[] }) => {
  // FIX: Initialize open if items exist
  const [isOpen, setIsOpen] = useState(prs.length > 0);

  // Sync state if data changes (e.g. on refresh)
  useEffect(() => {
    if (prs.length > 0) setIsOpen(true);
    else setIsOpen(false);
  }, [prs.length]);

  return (
    <div className="mb-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-200">
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          {title}
        </div>
        <span className="text-sm font-bold bg-gray-200 dark:bg-gray-700 px-2.5 py-0.5 rounded-full text-gray-700 dark:text-gray-300">
          {prs.length}
        </span>
      </button>

      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white dark:bg-gray-900 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="p-2 w-16 text-center group cursor-help relative">
                  <div className="flex justify-center"><Clock size={16} /></div>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white px-2 py-1 rounded normal-case z-20">Last Update</span>
                </th>
                    <th className="p-2 w-16 text-center">Status</th>
                    <th className="p-2">Title / Repo</th>
                    <th className="p-2 w-24">Size</th>
                    <th className="p-2 w-16 text-center">Author</th>
                    <th className="p-2">Reviewers</th>
                    <th className="p-2 w-24">Comments</th>
                    <th className="p-2 w-20 text-center">Approvals</th>
              </tr>
            </thead>
            <tbody>
              {prs.length === 0 ? (
                <tr>
                      <td colSpan={9} className="p-4 text-center text-gray-400 italic">No requests in this section.</td>
                </tr>
              ) : (
                prs.map(pr => <PRRow key={pr.uniqueKey} pr={pr} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [data, setData] = useState<UnifiedPullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    gitlabHost: 'https://gitlab.com',
    gitlabToken: '',
    githubToken: '',
    githubUsername: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('dashgit-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings(parsed);
      fetchData(parsed);
    } else setIsSettingsOpen(true);
  }, []);

  const handleSave = (newSettings: any) => {
    setSettings(newSettings);
    localStorage.setItem('dashgit-settings', JSON.stringify(newSettings));
    setIsSettingsOpen(false);
    fetchData(newSettings);
  };

  const fetchData = async (cfg = settings) => {
    setLoading(true);
    const promises = [];
    if (cfg.gitlabToken) promises.push(fetchGitlabMRs(cfg.gitlabHost, cfg.gitlabToken));
    if (cfg.githubToken) promises.push(fetchGithubPRs(cfg.githubToken, cfg.githubUsername));

    try {
      const res = await Promise.all(promises);
      setData(res.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sections = useMemo(() => {
    const buckets = {
      returned: [] as UnifiedPullRequest[],
      reviewRequested: [] as UnifiedPullRequest[],
      yourMergeRequests: [] as UnifiedPullRequest[],
      waitingForAuthor: [] as UnifiedPullRequest[],
      waitingForApprovals: [] as UnifiedPullRequest[],
      approvedByYou: [] as UnifiedPullRequest[],
      approvedByOthers: [] as UnifiedPullRequest[],
    };

    data.forEach(pr => {
      if (pr.isAuthor && (pr.pipelineStatus === 'failed' || pr.overallReviewState === 'changes_requested')) {
        buckets.returned.push(pr);
        return;
      }
      if (pr.isAuthor && pr.overallReviewState === 'approved') {
        buckets.approvedByOthers.push(pr);
        return;
      }
      if (pr.isAuthor && pr.approvals.given < pr.approvals.required) {
        buckets.waitingForApprovals.push(pr);
        return;
      }
      if (pr.isAuthor) {
        buckets.yourMergeRequests.push(pr);
        return;
      }
      if (pr.isReviewer && pr.myReviewState === 'approved') {
        buckets.approvedByYou.push(pr);
        return;
      }
      if (pr.isReviewer && (pr.myReviewState === 'changes_requested' || pr.myReviewState === 'commented')) {
        buckets.waitingForAuthor.push(pr);
        return;
      }
      if (pr.isReviewer && pr.myReviewState === 'pending') {
        buckets.reviewRequested.push(pr);
        return;
      }
    });

    return buckets;
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center mb-2">
          <div className="ml-auto flex gap-2">
            <button onClick={() => fetchData()} disabled={loading} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800">
              <Settings size={20} />
            </button>
          </div>
        </div>

        <Section title="Returned to you" prs={sections.returned} />
        <Section title="Review requested" prs={sections.reviewRequested} />
        <Section title="Your merge requests" prs={sections.yourMergeRequests} />
        <Section title="Waiting for the author or assignee" prs={sections.waitingForAuthor} />
        <Section title="Waiting for approvals" prs={sections.waitingForApprovals} />
        <Section title="Approved by you" prs={sections.approvedByYou} />
        <Section title="Approved by others" prs={sections.approvedByOthers} />

        {isSettingsOpen && (
          <div onClick={() => setIsSettingsOpen(false)} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-900 p-4 rounded-lg w-full max-w-md border dark:border-gray-800">
              <h2 className="text-xl font-bold mb-4">Configuration</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Gitlab size={16} className="text-orange-600" />
                    <h3 className="text-sm font-semibold">GitLab</h3>
                  </div>
                  <input 
                    type="text" placeholder="GitLab Host" 
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                    value={settings.gitlabHost} onChange={e => setSettings({...settings, gitlabHost: e.target.value})}
                  />
                  <input 
                    type="password" placeholder="GitLab Token" 
                    className="w-full p-2 mt-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                    value={settings.gitlabToken} onChange={e => setSettings({...settings, gitlabToken: e.target.value})}
                  />
                </div>

                <hr className="dark:border-gray-700" />

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Github size={16} />
                    <h3 className="text-sm font-semibold">GitHub</h3>
                  </div>
                  <input 
                    type="text" placeholder="GitHub Username" 
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                    value={settings.githubUsername} onChange={e => setSettings({...settings, githubUsername: e.target.value})}
                  />
                  <input 
                    type="password" placeholder="GitHub Token" 
                    className="w-full p-2 mt-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                    value={settings.githubToken} onChange={e => setSettings({...settings, githubToken: e.target.value})}
                  />
                </div>

                <button onClick={() => handleSave(settings)} className="w-full bg-blue-600 text-white py-1 rounded font-bold hover:bg-blue-700">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
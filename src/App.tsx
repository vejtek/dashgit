import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ChevronDown, 
  ChevronRight, 
  MessageSquare,
  GitPullRequest,
  RefreshCw,
  Settings,
  FileText,
  Clock,
  Github,
  Gitlab,
  Save,
  Loader2
} from 'lucide-react';

// Import shared types and adapters
import type { UnifiedPullRequest, User, PipelineStatus, RepoSource } from './types';
import { fetchGithubPRs } from './adapters/github';
import { fetchGitlabMRs } from './adapters/gitlab';

// --- 1. SETTINGS COMPONENT ---

interface AppSettings {
  githubToken: string;
  githubUsername: string;
  gitlabToken: string;
  gitlabHost: string;
  gitlabUsername: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  githubToken: '',
  githubUsername: '',
  gitlabToken: '',
  gitlabHost: 'https://gitlab.com',
  gitlabUsername: ''
};

const SettingsModal = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  settings: AppSettings; 
  onSave: (s: AppSettings) => void; 
}) => {
  const [formData, setFormData] = useState(settings);

  useEffect(() => {
    if (isOpen) setFormData(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5" /> API Configuration
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* GitHub Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              <Github className="w-4 h-4" /> GitHub
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Personal Access Token (Classic)</label>
              <input 
                type="password" 
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ghp_..."
                value={formData.githubToken}
                onChange={e => setFormData({...formData, githubToken: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
              <input 
                type="text" 
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="octocat"
                value={formData.githubUsername}
                onChange={e => setFormData({...formData, githubUsername: e.target.value})}
              />
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-700" />

          {/* GitLab Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              <Gitlab className="w-4 h-4" /> GitLab
            </div>
             <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">GitLab Host URL</label>
              <input 
                type="text" 
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://gitlab.com"
                value={formData.gitlabHost}
                onChange={e => setFormData({...formData, gitlabHost: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Personal Access Token</label>
              <input 
                type="password" 
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="glpat-..."
                value={formData.gitlabToken}
                onChange={e => setFormData({...formData, gitlabToken: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
              <input 
                type="text" 
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="jdoe"
                value={formData.gitlabUsername}
                onChange={e => setFormData({...formData, gitlabUsername: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button 
            onClick={() => onSave(formData)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 2. HELPER COMPONENTS ---

function getRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let text = "";
  let colorClass = "";

  if (diffHours < 1) {
    text = `${Math.floor(diffMs / (1000 * 60))}m`;
    colorClass = "text-green-600 dark:text-green-400";
  } else if (diffHours < 24) {
    text = `${Math.floor(diffHours)}h`;
    colorClass = "text-green-600 dark:text-green-400";
  } else if (diffDays < 7) {
    text = `${Math.floor(diffDays)}d`;
    colorClass = "text-yellow-600 dark:text-yellow-400";
  } else {
    text = `${Math.floor(diffDays)}d`;
    colorClass = "text-red-600 dark:text-red-400";
  }
  return { text, colorClass };
}

const SourceIcon = ({ source }: { source: RepoSource }) => {
  if (source === 'gitlab') return <Gitlab className="w-4 h-4 text-orange-600" />;
  return <Github className="w-4 h-4 text-gray-900 dark:text-gray-100" />;
};

const StatusIcon = ({ status }: { status: PipelineStatus }) => {
  switch (status) {
    case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
    case 'warning': return <AlertCircle className="w-5 h-5 text-orange-500" />;
    default: return <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />;
  }
};

const Avatar = ({ user }: { user: User }) => (
  <div className="relative group/avatar cursor-help">
    <img 
      src={user.avatarUrl} 
      alt={user.name} 
      className="rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 object-cover w-8 h-8" 
    />
    <span className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/avatar:block bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
      {user.name}
    </span>
  </div>
);

const Section = ({ title, count, children }: { title: string, count: number, children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(count > 0);

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm bg-white dark:bg-gray-800 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
          {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          {title}
        </div>
        <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold px-2 py-1 rounded-full">{count}</span>
      </button>
      
      {isOpen && (
        <div className="overflow-x-auto">
          {count === 0 ? (
            <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-sm italic">
              No requests in this category.
            </div>
          ) : (
            <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="p-3 w-12 text-center">
                     <div className="group/head-tooltip relative flex justify-center">
                        <Clock className="w-4 h-4" />
                        <span className="absolute top-full mt-1 hidden group-hover/head-tooltip:block bg-gray-800 text-white text-xs px-2 py-1 rounded z-10">Last Update</span>
                     </div>
                  </th>
                  <th className="p-3 w-10 text-center">CI</th>
                  <th className="p-3">Title / Repo</th>
                  <th className="p-3 w-32">Size</th>
                  <th className="p-3 w-16 text-center">Author</th>
                  <th className="p-3">Reviewers</th>
                  <th className="p-3">Comments</th>
                  <th className="p-3">Approvals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {children}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const PRRow = ({ pr }: { pr: UnifiedPullRequest }) => {
  const timeData = getRelativeTime(pr.updatedAt);
  
  return (
    <tr className="hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors group">
      <td className={`p-3 text-center font-bold ${timeData.colorClass}`}>
        <div className="cursor-help" title={`Last update: ${pr.updatedAt.toLocaleString()}`}>
          {timeData.text}
        </div>
      </td>
      <td className="p-3 text-center">
        <div className="flex justify-center">
          <StatusIcon status={pr.pipelineStatus} />
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-start gap-2">
           <div className="mt-0.5"><SourceIcon source={pr.source} /></div>
           <div className="flex flex-col">
              <a href={pr.url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 dark:text-blue-400 hover:underline block truncate max-w-md">
                {pr.title} <span className="text-gray-400 dark:text-gray-500 font-normal">#{pr.id}</span>
              </a>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                <GitPullRequest className="w-3 h-3" />
                {pr.repoName}
              </div>
           </div>
        </div>
      </td>
      <td className="p-3">
        <div className="flex flex-col text-xs">
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
             <FileText className="w-3 h-3" />
             {pr.changes.files} files
          </div>
          <div className="font-mono">
             <span className="text-green-600 dark:text-green-400">+{pr.changes.additions}</span>
             <span className="text-gray-400 mx-1">/</span>
             <span className="text-red-600 dark:text-red-400">-{pr.changes.deletions}</span>
          </div>
        </div>
      </td>
      <td className="p-3 text-center">
         <div className="flex justify-center">
            <Avatar user={pr.author} />
         </div>
      </td>
      <td className="p-3">
        <div className="flex -space-x-2 overflow-visible">
          {pr.reviewers.length === 0 ? <span className="text-gray-400 dark:text-gray-600 text-xs">-</span> : 
            pr.reviewers.map((r, i) => (
            <div key={i} className="relative z-0 hover:z-10 transition-transform hover:scale-110">
              <Avatar user={r} />
            </div>
          ))}
        </div>
      </td>
      <td className="p-3">
        {pr.commentStats.total === 0 ? (
          <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
        ) : pr.commentStats.resolved === pr.commentStats.total ? (
           <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
             All resolved
           </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 text-xs">
            <MessageSquare className="w-3 h-3" />
            {pr.commentStats.resolved}/{pr.commentStats.total}
          </span>
        )}
      </td>
      <td className="p-3">
         <div className="flex items-center gap-1 text-xs">
           <span className={`font-bold ${pr.approvals.given >= pr.approvals.required ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
             {pr.approvals.given}
           </span>
           <span className="text-gray-400">/</span>
           <span className="text-gray-500">{pr.approvals.required}</span>
         </div>
      </td>
    </tr>
  );
};

// --- 3. MAIN APP ---

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('dashgit-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [data, setData] = useState<UnifiedPullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistence for settings
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('dashgit-settings', JSON.stringify(newSettings));
    setIsSettingsOpen(false);
    fetchData(newSettings); // Refresh immediately
  };

  const fetchData = async (currentSettings: AppSettings = settings) => {
    setLoading(true);
    setError(null);
    setData([]);

    try {
      const promises = [];
      
      // Conditionally fetch GitHub
      if (currentSettings.githubToken && currentSettings.githubUsername) {
        promises.push(fetchGithubPRs(currentSettings.githubToken, currentSettings.githubUsername)
          .catch(e => { console.error(e); throw new Error(`GitHub: ${e.message}`); }));
      }

      // Conditionally fetch GitLab
      if (currentSettings.gitlabToken && currentSettings.gitlabUsername) {
        promises.push(fetchGitlabMRs(currentSettings.gitlabHost, currentSettings.gitlabToken, currentSettings.gitlabUsername)
          .catch(e => { console.error(e); throw new Error(`GitLab: ${e.message}`); }));
      }

      if (promises.length === 0) {
        setLoading(false);
        return; // No tokens configured
      }

      const results = await Promise.all(promises);
      const combined = results.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      
      setData(combined);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (settings.githubToken || settings.gitlabToken) {
      fetchData();
    } else {
      setIsSettingsOpen(true); // Open settings if no tokens found
    }
  }, []);

  // Categorize Logic
  const sections = useMemo(() => {
    const buckets = {
      returned: [] as UnifiedPullRequest[],
      reviewRequested: [] as UnifiedPullRequest[],
      yourPRs: [] as UnifiedPullRequest[],
      waitingForApprovals: [] as UnifiedPullRequest[],
      approvedByYou: [] as UnifiedPullRequest[],
      approvedByOthers: [] as UnifiedPullRequest[],
    };

    data.forEach(pr => {
      // Logic 1: Returned (Failed CI or Changes Requested)
      if (pr.isAuthor && (pr.overallReviewState === 'changes_requested' || pr.pipelineStatus === 'failed')) {
        buckets.returned.push(pr);
        return;
      }
      // Logic 2: Review Requested (I am reviewer + pending)
      if (pr.isReviewer && pr.myReviewState === 'pending') {
        buckets.reviewRequested.push(pr);
        return;
      }
      // Logic 5: Approved by you
      if (pr.isReviewer && pr.myReviewState === 'approved') {
        buckets.approvedByYou.push(pr);
        return;
      }
      // Logic 6: Approved by others (I am author + approved)
      if (pr.isAuthor && pr.overallReviewState === 'approved') {
        buckets.approvedByOthers.push(pr);
        return;
      }
      // Logic 4: Waiting for approvals (I am author + pending approval)
      if (pr.isAuthor && pr.approvals.given < pr.approvals.required) {
        buckets.waitingForApprovals.push(pr);
        return;
      }
      // Logic 3: Default for my PRs
      if (pr.isAuthor) {
        buckets.yourPRs.push(pr);
      }
    });

    return buckets;
  }, [data]);

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans p-6 transition-colors duration-200 flex justify-center">
      <div className="max-w-7xl mx-auto w-full">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">DashGit</h1>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => fetchData()} 
               className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
               disabled={loading}
             >
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
             </button>
             <button 
               onClick={() => setIsSettingsOpen(true)}
               className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
             >
               <Settings className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-3">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty State / Welcome */}
        {!loading && data.length === 0 && !error && (
           <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
             <Settings className="w-12 h-12 text-gray-300 mx-auto mb-4" />
             <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300">No data found</h3>
             <p className="text-gray-400 text-sm mt-1">Configure your API tokens in settings to get started.</p>
             <button 
               onClick={() => setIsSettingsOpen(true)}
               className="mt-4 text-blue-600 hover:underline text-sm font-medium"
             >
               Open Settings
             </button>
           </div>
        )}

        {/* Loading State */}
        {loading && data.length === 0 && (
           <div className="flex justify-center py-20">
             <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
           </div>
        )}

        {/* Main Content */}
        {!loading && data.length > 0 && (
          <div className="space-y-2">
            <Section title="Returned to you" count={sections.returned.length}>
              {sections.returned.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>

            <Section title="Review requested" count={sections.reviewRequested.length}>
              {sections.reviewRequested.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>

            <Section title="Your merge requests" count={sections.yourPRs.length}>
              {sections.yourPRs.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>

            <Section title="Waiting for approvals" count={sections.waitingForApprovals.length}>
              {sections.waitingForApprovals.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>

            <Section title="Approved by you" count={sections.approvedByYou.length}>
              {sections.approvedByYou.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>

            <Section title="Approved by others" count={sections.approvedByOthers.length}>
              {sections.approvedByOthers.map(pr => <PRRow key={pr.id + pr.source} pr={pr} />)}
            </Section>
          </div>
        )}
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
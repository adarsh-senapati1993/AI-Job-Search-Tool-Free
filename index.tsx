import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SetupWizard } from './components/SetupWizard';
import { ProfileConfig } from './components/ProfileConfig';
import { Settings } from './components/Settings';
import { DiscoveryFeed } from './components/DiscoveryFeed';
import { ApplicationBoard } from './components/ApplicationBoard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { backupKeys, clearKeys, getDarkMode } from './lib/storage';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { ChatBot } from './components/ChatBot';
import { ToastContainer } from './components/ui/Toast';
import { useAppStore, useInitializeApp } from './lib/store';
import { CandidateProfile } from './lib/ai';
import { STORAGE_KEYS } from './lib/storage';

interface DashboardProps {
  onEditConfig: () => void;
  onRestart: () => void;
  onFactoryReset: () => void;
}

const Dashboard = ({ onEditConfig, onRestart, onFactoryReset }: DashboardProps) => {
  const config = useAppStore((state) => state.userConfig) as CandidateProfile | null;
  const [showSettings, setShowSettings] = useState(false);
  const darkMode = useAppStore((s) => s.darkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const handleRestartClick = () => {
    if (confirm("⚠️ SYSTEM RESET\n\nThis will disconnect your session and return you to the API Key Initialization screen.\n\nYour keys will be saved in backup for easy re-entry.\n\nProceed?")) {
        onRestart();
    }
  };

  if (!config) return <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-900 flex items-center justify-center text-[#86868B]">Loading Dashboard...</div>;

  const getLookbackLabel = (val: string) => {
      if (!val) return "Last 14 Days";
      if (val === '1d') return "Last 24 Hours";
      if (val === '3d') return "Last 3 Days";
      if (val === '7d') return "Last 7 Days";
      if (val === '14d') return "Last 14 Days";
      if (val === '30d') return "Last 30 Days";
      return val;
  };
  
  const activeProvider = useAppStore((state) => state.activeProvider);
  
  const getBrainLabel = () => {
    const provider = activeProvider || 'perplexity';
    let modelName = "";
    
    if (typeof window !== 'undefined') {
        if (provider === 'gemini') {
            modelName = localStorage.getItem('jobradar_gemini_model') || 'Flash 1.5';
        } else if (provider === 'perplexity') {
            modelName = 'Sonar Pro';
        } else if (provider === 'openai') {
            modelName = 'GPT-4o Mini';
        } else if (provider === 'anthropic') {
            modelName = 'Claude Haiku';
        } else if (provider === 'groq') {
            modelName = 'Llama 3.3 70B';
        } else if (provider === 'local') {
            modelName = 'Local CPU';
        }
    }
    
    return `${provider.charAt(0).toUpperCase() + provider.slice(1)}${modelName ? ` (${modelName})` : ''}`;
  };

  const TABS = [
    { id: 'feed' as const, label: '🔍 Job Feed', icon: '🔍' },
    { id: 'board' as const, label: '📋 Board', icon: '📋' },
    { id: 'analytics' as const, label: '📊 Analytics', icon: '📊' },
  ];

  return (
    <div className="min-h-screen relative pb-20">
      {/* Sticky Frosted Header */}
      <div className="sticky top-0 z-50 apple-glass px-4 sm:px-6 lg:px-8 py-4 mb-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl tracking-tight font-bold text-[#1D1D1F] dark:text-white">
              Job Radar
            </h1>
            <p className="text-[#86868B] text-xs mt-0.5 uppercase tracking-wider font-semibold">
              <span className="text-[#0071E3]">● Online</span> | Brain: {getBrainLabel()} | Eyes: Serper
            </p>
          </div>
          <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const newMode = !darkMode;
                  setDarkMode(newMode);
                  if (newMode) document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200/50 hover:bg-slate-200 text-[#1D1D1F] dark:bg-slate-700/50 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <Button variant="secondary" onClick={() => setShowSettings(true)} className="text-sm">
                Settings
              </Button>
              <Button variant="outline" onClick={handleRestartClick} className="text-sm text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20">
                Reset Session
              </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Configuration Summary Card */}
        <Card className="mb-6 relative overflow-hidden">
          {/* Header Row outside grid */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold text-[#86868B] uppercase tracking-widest">Target Parameters</h2>
            <Button variant="secondary" onClick={onEditConfig} className="text-xs h-8 flex items-center gap-1.5 shadow-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#1D1D1F] dark:text-slate-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Edit Parameters
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center text-sm shadow-sm shrink-0 mt-[2px]">🎯</div>
                      <div>
                        <div className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">Roles</div>
                        <div className="text-[#1D1D1F] dark:text-white font-medium text-sm leading-relaxed mt-0.5">{config.target_roles?.join(' / ')}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#34C759]/10 text-[#34C759] flex items-center justify-center text-sm shadow-sm shrink-0 mt-[2px]">🌍</div>
                      <div>
                        <div className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">Locations</div>
                        <div className="text-[#1D1D1F] dark:text-white font-medium text-sm mt-0.5">{config.locations?.join(', ')}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center text-sm shadow-sm shrink-0 mt-[2px]">🏭</div>
                      <div>
                        <div className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">Industries</div>
                        <div className="text-[#1D1D1F] dark:text-white font-medium text-sm mt-0.5">{config.industries?.length ? config.industries.join(', ') : 'Any'}</div>
                      </div>
                    </div>
                     <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center text-sm shadow-sm shrink-0 mt-[2px]">⏰</div>
                      <div>
                        <div className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">Time Horizon</div>
                        <div className="text-[#1D1D1F] dark:text-white font-medium text-sm mt-0.5">{getLookbackLabel(config.search_lookback || '14d')}</div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
            
            <div className="lg:border-l border-slate-200 dark:border-slate-800 lg:pl-8 space-y-6 pt-6 lg:pt-0">
               <div>
                   <h2 className="text-xs font-bold text-[#86868B] uppercase tracking-widest mb-5 flex items-center gap-2">
                      <span className="text-lg">🧠</span> AI Profile Analysis
                   </h2>
                   {config.professional_bio ? (
                       <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                           <p className="text-sm text-[#1D1D1F] dark:text-slate-300 italic leading-relaxed">
                               "{config.professional_bio}"
                           </p>
                           {config.seniority_level && (
                               <div className="mt-4 flex gap-2 items-center">
                                  <span className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider">Inferred Seniority:</span>
                                  <span className="text-[10px] uppercase font-bold text-[#0071E3] bg-[#0071E3]/10 px-2 py-0.5 rounded-full">{config.seniority_level}</span>
                               </div>
                           )}
                       </div>
                   ) : (
                       <p className="text-sm text-[#86868B]">No narrative bio generated. Check resume.</p>
                   )}
               </div>

               <div>
                   <div className="flex flex-wrap gap-2 mt-4">
                     {config.skills?.slice(0, 10).map((skill: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-[#1D1D1F] dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {skill}
                        </span>
                     ))}
                     {config.skills?.length > 10 && (
                        <span className="px-3 py-1 text-xs font-medium text-[#86868B]">+{config.skills.length - 10} more</span>
                     )}
                   </div>
               </div>
            </div>
          </div>
        </Card>

        {/* Tab Bar Segmented Control */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-full border border-slate-300/50 dark:border-slate-700/50">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-700 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#86868B] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'feed' && <DiscoveryFeed />}
        {activeTab === 'board' && <ApplicationBoard />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}

      </div>
      
      {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            onReset={onFactoryReset} 
          />
      )}
      <ChatBot />
    </div>
  );
};

const App = () => {
  useInitializeApp(); // This hook now handles the initialization logic
  const appState = useAppStore((state) => state.appState);
  const setAppState = useAppStore((state) => state.setAppState);
  const darkMode = useAppStore((s) => s.darkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);

  // Apply dark mode on mount — also handle removing dark class
  useEffect(() => {
    if (getDarkMode()) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleSoftRestart = () => {
    backupKeys();
    clearKeys();
    window.location.reload();
  };

  const handleFactoryReset = () => {
    if (typeof window !== 'undefined') localStorage.clear();
    window.location.reload();
  };

  if (appState === 'loading') {
    return <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-950 flex items-center justify-center text-[#86868B]">System Initializing...</div>;
  }

  return (
    <>
      <ToastContainer />
      {/* Global Dark Mode Toggle — visible on all screens */}
      {appState !== 'dashboard' && (
        <div className="fixed top-4 right-4 z-[100]">
          <button
            onClick={() => {
              const newMode = !darkMode;
              setDarkMode(newMode);
              if (newMode) document.documentElement.classList.add('dark');
              else document.documentElement.classList.remove('dark');
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-[#1D1D1F] dark:text-slate-300 transition-all shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:scale-110"
            title="Toggle Dark/Light Mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      )}
      {appState === 'setup' ? (
        <SetupWizard onComplete={() => setAppState('config')} />
      ) : appState === 'config' ? (
        <ProfileConfig 
            onComplete={() => setAppState('dashboard')} 
            onBack={() => setAppState('setup')} 
        />
      ) : (
        <Dashboard 
            onEditConfig={() => setAppState('config')} 
            onRestart={handleSoftRestart}
            onFactoryReset={handleFactoryReset}
        />
      )}
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
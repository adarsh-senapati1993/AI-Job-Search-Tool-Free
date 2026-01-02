import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SetupWizard } from './components/SetupWizard';
import { ProfileConfig } from './components/ProfileConfig';
import { Settings } from './components/Settings';
import { DiscoveryFeed } from './components/DiscoveryFeed';
import { hasRequiredKeys, getConfig, getKey, STORAGE_KEYS, clearKeys, backupKeys } from './lib/storage';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';

interface DashboardProps {
  onEditConfig: () => void;
  onRestart: () => void;
  onFactoryReset: () => void;
}

const Dashboard = ({ onEditConfig, onRestart, onFactoryReset }: DashboardProps) => {
  const [config, setConfig] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  const handleRestartClick = () => {
    if (confirm("⚠️ SYSTEM RESTART\n\nThis will reboot the system and return you to the initialization screen.\n\nYour API Keys will be pre-filled to save time.\n\nProceed?")) {
        onRestart();
    }
  };

  if (!config) return null;

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white relative">
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        {/* Header Status */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
              Job Radar Command
            </h1>
            <p className="text-slate-400 text-sm mt-1 uppercase tracking-wider font-mono">
              <span className="text-emerald-400">● Online</span> | Brain: Perplexity Sonar | Eyes: Serper
            </p>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium border border-slate-700 transition-colors text-slate-300"
            >
              Settings
            </button>
            <button 
              onClick={handleRestartClick}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium border border-slate-700 transition-colors text-amber-400 hover:text-amber-300 border-amber-900/30"
            >
              Restart
            </button>
          </div>
        </div>

        {/* Configuration Summary Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
            
            {/* Edit Button overlay for the whole card context */}
            <div className="absolute top-0 right-0">
               <Button variant="secondary" onClick={onEditConfig} className="text-xs h-8 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  Edit Parameters
               </Button>
            </div>

            <div className="space-y-6">
              <div>
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Target Lock</h2>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">🎯</div>
                      <div>
                        <div className="text-sm font-medium text-slate-300">Roles</div>
                        <div className="text-white font-mono text-sm">{config.target_roles?.join(', ')}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">🌍</div>
                      <div>
                        <div className="text-sm font-medium text-slate-300">Locations</div>
                        <div className="text-white font-mono text-sm">{config.locations?.join(', ')}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">⏱️</div>
                      <div>
                        <div className="text-sm font-medium text-slate-300">Search Window</div>
                        <div className="text-white font-mono text-sm">
                            {config.search_lookback === '1d' ? 'Last 24 Hours' : 
                             config.search_lookback === '3d' ? 'Last 3 Days' :
                             config.search_lookback === '7d' ? 'Last 7 Days' :
                             config.search_lookback === '30d' ? 'Last 30 Days' : 'Last 14 Days'}
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
            
            <div className="border-l border-slate-700 pl-8 space-y-6">
               <div>
                   <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">AI Profile Analysis</h2>
                   {config.professional_bio ? (
                       <p className="text-sm text-slate-300 italic leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                           "{config.professional_bio}"
                       </p>
                   ) : (
                       <p className="text-sm text-slate-500">No narrative bio generated. Check resume.</p>
                   )}
               </div>

               <div>
                   <div className="flex flex-wrap gap-2 mb-2">
                     {config.skills?.slice(0, 8).map((skill: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">
                            {skill}
                        </span>
                     ))}
                     {config.skills?.length > 8 && (
                        <span className="px-2 py-1 text-xs text-slate-500">+{config.skills.length - 8} more</span>
                     )}
                   </div>
               </div>
            </div>
          </div>
        </Card>

        {/* THE MAIN FEED */}
        <DiscoveryFeed />

      </div>
      
      {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            onReset={onFactoryReset} 
          />
      )}
    </div>
  );
};

const App = () => {
  const [appState, setAppState] = useState<'loading' | 'setup' | 'config' | 'dashboard'>('loading');

  useEffect(() => {
    const checkState = () => {
      const hasKeys = hasRequiredKeys();
      const hasConfig = !!getConfig();

      if (!hasKeys) {
        setAppState('setup');
      } else if (!hasConfig) {
        setAppState('config');
      } else {
        setAppState('dashboard');
      }
    };
    checkState();
  }, []);

  // Soft Restart: Backs up keys, clears current session, goes to setup (pre-filled)
  const handleSoftRestart = () => {
    backupKeys();
    clearKeys();
    setAppState('loading');
    setTimeout(() => setAppState('setup'), 100);
  };

  // Factory Reset: Wipes everything including backups
  const handleFactoryReset = () => {
    clearKeys(); 
    localStorage.removeItem(STORAGE_KEYS.KEY_BACKUP);
    setAppState('loading');
    setTimeout(() => setAppState('setup'), 100);
  };

  if (appState === 'loading') return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">System Initializing...</div>;

  return (
    <>
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
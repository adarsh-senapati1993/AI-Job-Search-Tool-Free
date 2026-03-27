import React from 'react';
import { Card } from './ui/Card';
import { getLatestRun, getRunHistory } from '../lib/storage';
import type { ScoredLead } from '../lib/scoring';

export const AnalyticsDashboard = () => {
    const lastRun = getLatestRun();
    const leads: ScoredLead[] = lastRun?.leads || [];
    const runHistory = getRunHistory();

    if (leads.length === 0) {
        return (
            <Card className="text-center py-20 flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 shadow-none bg-transparent">
                <div className="text-5xl mb-6 opacity-80">📊</div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">No Analytics Data</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                    Run a discovery scan from the Job Feed tab to generate analytics.
                </p>
            </Card>
        );
    }

    // KPI calculations
    const totalLeads = leads.length;
    const applied = leads.filter(l => l.status === 'approved').length;
    const interviews = leads.filter(l => l.status === 'maybe').length;
    const avgScore = Math.round(leads.reduce((sum, l) => sum + l.score, 0) / totalLeads);
    const highScoreLeads = leads.filter(l => l.score >= 80).length;
    const withSalary = leads.filter(l => l.salary && l.salary !== 'Not disclosed').length;

    // Score distribution
    const distribution = [
        { label: '90-100', count: leads.filter(l => l.score >= 90).length, color: '#34d399' },
        { label: '80-89', count: leads.filter(l => l.score >= 80 && l.score < 90).length, color: '#6ee7b7' },
        { label: '70-79', count: leads.filter(l => l.score >= 70 && l.score < 80).length, color: '#fbbf24' },
        { label: '60-69', count: leads.filter(l => l.score >= 60 && l.score < 70).length, color: '#fb923c' },
        { label: '50-59', count: leads.filter(l => l.score >= 50 && l.score < 60).length, color: '#f87171' },
        { label: '<50', count: leads.filter(l => l.score < 50).length, color: '#94a3b8' },
    ];
    const maxDistCount = Math.max(...distribution.map(d => d.count), 1);

    // Top companies
    const companyCounts: Record<string, number> = {};
    leads.forEach(l => {
        if (l.company_name && l.company_name !== 'Unknown' && l.company_name !== 'Not specified') {
            companyCounts[l.company_name] = (companyCounts[l.company_name] || 0) + 1;
        }
    });
    const topCompanies = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Source breakdown
    const sourceCounts: Record<string, number> = {};
    leads.forEach(l => {
        const src = l.source?.replace('google-search', 'Web').replace('google-jobs', 'Jobs API').replace('regional-board', 'Regional') || 'Unknown';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);

    return (
        <div className="space-y-6">
            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { label: 'Total Leads', value: totalLeads, icon: '🔍', color: 'text-slate-900 dark:text-white' },
                    { label: 'High Match (80+)', value: highScoreLeads, icon: '🎯', color: 'text-[#34C759]' },
                    { label: 'Applied', value: applied, icon: '📨', color: 'text-[#0071E3]' },
                    { label: 'Interviews', value: interviews, icon: '📞', color: 'text-[#FF9500]' },
                    { label: 'Avg Score', value: avgScore, icon: '📊', color: 'text-[#5856D6]' },
                    { label: 'With Salary', value: withSalary, icon: '💰', color: 'text-[#FF2D55]' },
                ].map((kpi, i) => (
                    <Card key={i} className="bg-white dark:bg-[#1C1C1E] border border-slate-100 dark:border-slate-800/50 text-center py-5 shadow-sm rounded-[24px]">
                        <div className="text-3xl mb-2 opacity-90">{kpi.icon}</div>
                        <div className={`text-2xl tracking-tight font-bold ${kpi.color}`}>{kpi.value}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold mt-1.5">{kpi.label}</div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Score Distribution Bar Chart */}
                <Card className="bg-white dark:bg-[#1C1C1E] border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-[32px] p-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        📊 Score Distribution
                    </h3>
                    <div className="space-y-3">
                        {distribution.map((d, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <span className="text-[11px] font-bold text-slate-500 w-12 text-right">{d.label}</span>
                                <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${(d.count / maxDistCount) * 100}%`,
                                            backgroundColor: d.color,
                                            minWidth: d.count > 0 ? '8px' : '0'
                                        }}
                                    />
                                </div>
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 w-6">{d.count}</span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Top Companies */}
                <Card className="bg-white dark:bg-[#1C1C1E] border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-[32px] p-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        🏢 Top Companies
                    </h3>
                    {topCompanies.length > 0 ? (
                        <div className="space-y-3">
                            {topCompanies.map(([company, count], i) => {
                                const medalEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                                return (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-[#2C2C2E]/50 rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-800/30">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm">{medalEmoji || <span className="text-slate-400 font-bold">{i + 1}.</span>}</span>
                                            <span className="text-sm text-slate-900 dark:text-white font-bold">{company}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-[#0071E3] bg-[#0071E3]/10 px-2.5 py-1 rounded-full uppercase tracking-widest">
                                            {count} {count === 1 ? 'lead' : 'leads'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-slate-500 text-center py-8">No company data available</p>
                    )}
                </Card>

                {/* Source Breakdown */}
                <Card className="bg-white dark:bg-[#1C1C1E] border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-[32px] p-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        🔗 Discovery Sources
                    </h3>
                    <div className="space-y-4 pt-2">
                        {topSources.map(([source, count], i) => (
                            <div key={i} className="flex items-center justify-between gap-4">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[80px]">{source}</span>
                                <div className="flex-1 flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-[#0071E3]"
                                            style={{ width: `${(count / totalLeads) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-500 w-8 text-right">
                                        {Math.round((count / totalLeads) * 100)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Scan History */}
                <Card className="bg-white dark:bg-[#1C1C1E] border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-[32px] p-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        🕒 Recent Scans
                    </h3>
                    {runHistory.length > 0 ? (
                        <div className="space-y-3 pt-2">
                            {runHistory.slice(-5).reverse().map((ts, i) => {
                                const date = new Date(ts);
                                return (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className="w-2 h-2 rounded-full bg-[#34C759] shadow-[0_0_8px_rgba(52,199,89,0.5)]"></div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <span className="text-xs font-medium text-slate-500">
                                            {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-slate-500 text-center py-8">No scan history yet</p>
                    )}
                </Card>
            </div>
        </div>
    );
};

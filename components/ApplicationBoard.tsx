import React, { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { getLatestRun, getKanbanState, saveKanbanState } from '../lib/storage';
import type { ScoredLead } from '../lib/scoring';

const COLUMNS = [
    { id: 'wishlist', label: '⭐ Wishlist', color: 'slate' },
    { id: 'applied', label: '📨 Applied', color: 'blue' },
    { id: 'phone_screen', label: '📞 Phone Screen', color: 'indigo' },
    { id: 'interview', label: '🎯 Interview', color: 'amber' },
    { id: 'offer', label: '🎉 Offer', color: 'emerald' },
    { id: 'rejected', label: '❌ Rejected', color: 'red' },
] as const;

type ColumnId = typeof COLUMNS[number]['id'];

interface KanbanCard {
    lead: ScoredLead;
    column: ColumnId;
}

export const ApplicationBoard = () => {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<ColumnId | null>(null);

    useEffect(() => {
        const lastRun = getLatestRun();
        const kanbanState = getKanbanState();
        if (lastRun?.leads) {
            const mapped: KanbanCard[] = lastRun.leads.map((lead: ScoredLead) => ({
                lead,
                column: (kanbanState[lead.id] as ColumnId) || 'wishlist'
            }));
            setCards(mapped);
        }
    }, []);

    const persistState = useCallback((newCards: KanbanCard[]) => {
        const state: Record<string, string> = {};
        newCards.forEach(c => { state[c.lead.id] = c.column; });
        saveKanbanState(state);
    }, []);

    const handleDragStart = (e: React.DragEvent, leadId: string) => {
        setDraggedId(leadId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', leadId);
    };

    const handleDragOver = (e: React.DragEvent, columnId: ColumnId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(columnId);
    };

    const handleDragLeave = () => {
        setDropTarget(null);
    };

    const handleDrop = (e: React.DragEvent, columnId: ColumnId) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('text/plain');
        if (!leadId) return;

        setCards(prev => {
            const updated = prev.map(c =>
                c.lead.id === leadId ? { ...c, column: columnId } : c
            );
            persistState(updated);
            return updated;
        });
        setDraggedId(null);
        setDropTarget(null);
    };

    const clearRejected = () => {
        setCards(prev => {
            const updated = prev.filter(c => c.column !== 'rejected');
            persistState(updated);
            return updated;
        });
    };

    const getColumnCards = (columnId: ColumnId) =>
        cards.filter(c => c.column === columnId);

    const getColumnColorClass = (color: string) => {
        const map: Record<string, string> = {
            slate: 'border-slate-300 dark:border-slate-600',
            blue: 'border-[#0071E3]',
            indigo: 'border-[#5856D6]',
            amber: 'border-[#FF9500]',
            emerald: 'border-[#34C759]',
            red: 'border-[#FF3B30]',
        };
        return map[color] || 'border-slate-400 dark:border-slate-700';
    };

    const getColumnBgClass = (color: string) => {
        const map: Record<string, string> = {
            slate: 'bg-slate-100 dark:bg-slate-800/40',
            blue: 'bg-[#0071E3]/5 dark:bg-[#0071E3]/10',
            indigo: 'bg-[#5856D6]/5 dark:bg-[#5856D6]/10',
            amber: 'bg-[#FF9500]/5 dark:bg-[#FF9500]/10',
            emerald: 'bg-[#34C759]/5 dark:bg-[#34C759]/10',
            red: 'bg-[#FF3B30]/5 dark:bg-[#FF3B30]/10',
        };
        return map[color] || 'bg-slate-50 dark:bg-slate-900/50';
    };

    if (cards.length === 0) {
        return (
            <Card className="text-center py-20 flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 shadow-none bg-transparent">
                <div className="text-5xl mb-6 opacity-80">📋</div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">No Applications Yet</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                    Run a discovery scan from the Job Feed tab first. Your scored leads will appear here for tracking.
                </p>
            </Card>
        );
    }

    const rejectedCount = cards.filter(c => c.column === 'rejected').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Application Board</h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">{cards.length} total applications tracked</p>
                </div>
                {rejectedCount > 0 && (
                    <Button
                        variant="ghost"
                        onClick={clearRejected}
                        className="text-xs font-bold text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-full"
                    >
                        Clear {rejectedCount} Rejected
                    </Button>
                )}
            </div>

            <div className="flex overflow-x-auto pb-8 snap-x snap-mandatory hide-scrollbar">
                <div className="flex gap-4 min-w-max px-2">
                    {COLUMNS.map(col => {
                        const colCards = getColumnCards(col.id);
                        const isDropping = dropTarget === col.id;

                        return (
                            <div
                                key={col.id}
                                className={`snap-center shrink-0 w-[300px] flex flex-col rounded-[24px] border-2 transition-all duration-300 min-h-[500px] ${
                                    isDropping
                                        ? `${getColumnColorClass(col.color)} ${getColumnBgClass(col.color)} scale-[1.02] shadow-xl`
                                        : 'border-transparent bg-slate-100 dark:bg-slate-900/60'
                                }`}
                                onDragOver={(e) => handleDragOver(e, col.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, col.id)}
                            >
                                {/* Column Header */}
                                <div className="px-5 py-4 flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                        {col.label}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shadow-inner">
                                        {colCards.length}
                                    </span>
                                </div>

                                {/* Cards */}
                                <div className="p-3 pt-0 flex-1 space-y-3 overflow-y-auto hide-scrollbar">
                                    {colCards.map(card => {
                                        const isDragging = draggedId === card.lead.id;
                                        const scoreColor = card.lead.score >= 80 ? 'text-[#34C759]' : card.lead.score >= 50 ? 'text-[#FF9500]' : 'text-[#FF3B30]';

                                        return (
                                            <div
                                                key={card.lead.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, card.lead.id)}
                                                className={`p-4 rounded-2xl cursor-grab active:cursor-grabbing transition-all duration-300 ${
                                                    isDragging
                                                        ? 'opacity-40 scale-95 border-2 border-[#0071E3] bg-[#0071E3]/10'
                                                        : 'bg-white dark:bg-[#1C1C1E] shadow-[0_4px_12px_rgb(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgb(0,0,0,0.2)] hover:shadow-[0_8px_24px_rgb(0,0,0,0.08)] hover:-translate-y-1 border border-transparent dark:border-slate-800/50'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                                            {card.lead.role_title}
                                                        </p>
                                                        <p className="text-[11px] font-medium text-slate-500 mt-1 truncate">
                                                            {card.lead.company_name}
                                                        </p>
                                                    </div>
                                                    <div className={`text-xs font-bold ${scoreColor} shrink-0 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700/50 text-center shadow-sm`}>
                                                        {card.lead.score}
                                                    </div>
                                                </div>
                                                {card.lead.matched_skills && card.lead.matched_skills.length > 0 && (
                                                    <div className="flex gap-1.5 mt-3 flex-wrap">
                                                        {card.lead.matched_skills.slice(0, 3).map((s, i) => (
                                                            <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {colCards.length === 0 && (
                                        <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-300/50 dark:border-slate-700/50 rounded-2xl mx-1 my-2">
                                            <span className="text-slate-400 dark:text-slate-600 text-[11px] font-bold uppercase tracking-wider">Drop Here</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

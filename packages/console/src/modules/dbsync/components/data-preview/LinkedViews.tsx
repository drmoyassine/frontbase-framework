import React, { useState } from 'react';
import { Link as LinkIcon, Trash2 } from 'lucide-react';

interface LinkedViewsProps {
    linkedViews: Record<string, any>;
    setLinkedViews: (val: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
}

export const LinkedViews = ({ linkedViews, setLinkedViews }: LinkedViewsProps) => {
    return (
        <div className="p-6">
            <h4 className="text-sm font-bold mb-2 uppercase">Linked Views</h4>
            <div className="grid gap-3">
                {Object.entries(linkedViews).map(([key, config]) => (
                    <div key={key} className="p-3 border border-gray-100 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <LinkIcon size={16} />
                            <div>
                                <div className="text-[10px] font-bold">{key}</div>
                                <div className="text-[9px] text-gray-400">{config.view_id}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                const { [key]: _, ...rest } = linkedViews;
                                setLinkedViews(rest);
                            }}
                            className="text-gray-300 hover:text-red-500"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => {
                        const k = prompt("Field (e.g. acf):"); if (!k) return;
                        const v = prompt("View UUID:"); if (!v) return;
                        // @ts-ignore
                        setLinkedViews(p => ({ ...p, [k]: { view_id: v, join_on: 'id', target_key: 'id' } }));
                    }}
                    className="p-4 border-2 border-dashed border-gray-100 rounded-xl text-gray-400 text-xs hover:border-primary-500 hover:text-primary-600 transition-all font-sans"
                >
                    + Add Linked Data View
                </button>
            </div>
        </div>
    );
};

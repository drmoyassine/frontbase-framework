import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { WorkspaceAgentChat } from './WorkspaceAgentChat';

const PROFILE_SLUG = 'workspace-agent';

export const GlobalAgentChat: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Floating AI Agent Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
                aria-label="Toggle Agent Chat"
            >
                <Bot className="w-6 h-6" />
            </button>

            <WorkspaceAgentChat 
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
                profileSlug={PROFILE_SLUG}
            />
        </>
    );
};

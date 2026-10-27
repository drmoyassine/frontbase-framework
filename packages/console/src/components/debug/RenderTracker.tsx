import React, { useRef, useEffect } from 'react';

// Get debug mode from environment or localStorage
const isDebugEnabled = () => {
  // Only enable if explicitly requested via localStorage for debugging
  return localStorage.getItem('enableRenderTracking') === 'true' && import.meta.env.DEV;
};

interface RenderTrackerProps {
  name: string;
  children: React.ReactNode;
  maxRenders?: number;
}

export const RenderTracker: React.FC<RenderTrackerProps> = ({ 
  name, 
  children, 
  maxRenders = 50 
}) => {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());
  
  // Only track if debug is enabled
  if (isDebugEnabled()) {
    renderCount.current += 1;
    const currentTime = Date.now();
    const timeSinceLastRender = currentTime - lastRenderTime.current;
    lastRenderTime.current = currentTime;

    // Log render information only in debug mode
    console.log(`[RenderTracker] ${name} rendered ${renderCount.current} times (${timeSinceLastRender}ms since last)`);
    
    // Warn about excessive renders
    if (renderCount.current > maxRenders) {
      console.error(`[RenderTracker] WARNING: ${name} has rendered ${renderCount.current} times - possible infinite loop!`);
    }
    
    // Alert for rapid renders (potential infinite loop)
    if (timeSinceLastRender < 10 && renderCount.current > 10) {
      console.error(`[RenderTracker] CRITICAL: ${name} rendering too rapidly (${timeSinceLastRender}ms) - infinite loop detected!`);
    }

    // Reset counter periodically to avoid false positives
    useEffect(() => {
      const resetTimer = setTimeout(() => {
        if (renderCount.current > 0) {
          console.log(`[RenderTracker] Resetting counter for ${name} (was ${renderCount.current})`);
          renderCount.current = 0;
        }
      }, 5000);

      return () => clearTimeout(resetTimer);
    }, [name]);
  }

  return <>{children}</>;
};

// Hook to track component renders - only when debug is enabled
export const useRenderTracker = (componentName: string) => {
  const renderCount = useRef(0);
  const lastProps = useRef<any>(null);
  
  if (isDebugEnabled()) {
    renderCount.current += 1;
    
    useEffect(() => {
      console.log(`[useRenderTracker] ${componentName} render #${renderCount.current}`);
    });
  }

  return {
    renderCount: renderCount.current,
    logPropsChange: (props: any) => {
      if (isDebugEnabled() && lastProps.current) {
        const changedKeys = Object.keys(props).filter(
          key => props[key] !== lastProps.current[key]
        );
        if (changedKeys.length > 0) {
          console.log(`[useRenderTracker] ${componentName} props changed:`, changedKeys);
        }
      }
      lastProps.current = props;
    }
  };
};
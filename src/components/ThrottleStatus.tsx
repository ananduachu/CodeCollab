/**
 * Throttle Status Component
 * Shows current database throttling status and usage statistics
 */

import { useState, useEffect } from 'react';
import { dbManager } from '../utils/database/dbManager';
import { Activity, Clock, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';

interface ThrottleStatusData {
  reads: {
    lastMinute: number;
    lastHour: number;
    lastDay: number;
    percentageUsed: number;
  };
  writes: {
    lastMinute: number;
    lastHour: number;
    lastDay: number;
    percentageUsed: number;
  };
  throttled: boolean;
  adaptiveDelay: number;
}

export function ThrottleStatus() {
  const [status, setStatus] = useState<ThrottleStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadStatus();
    
    // Refresh status every 10 seconds
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const throttleStatus = dbManager.getThrottleStatus();
      setStatus(throttleStatus);
    } catch (error) {
      console.error('Failed to load throttle status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 0.9) return 'text-red-500';
    if (percentage >= 0.8) return 'text-orange-500';
    if (percentage >= 0.6) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 0.9) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (percentage >= 0.8) return <Clock className="w-4 h-4 text-orange-500" />;
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const formatPercentage = (value: number) => Math.round(value * 100);

  if (loading || !status) {
    return null;
  }

  const maxPercentage = Math.max(status.reads.percentageUsed, status.writes.percentageUsed);

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Collapsed view */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors w-full"
        >
          <Activity className="w-4 h-4" />
          <span className="font-medium">Throttle</span>
          {getStatusIcon(maxPercentage)}
          <span className={`text-sm ${getStatusColor(maxPercentage)}`}>
            {formatPercentage(maxPercentage)}%
          </span>
          {status.throttled && (
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* Expanded view */}
        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3 w-80">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Database Usage Statistics
            </div>

            {/* Reads Section */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center justify-between">
                <span>📖 Reads</span>
                <span className={getStatusColor(status.reads.percentageUsed)}>
                  {formatPercentage(status.reads.percentageUsed)}% used
                </span>
              </div>
              
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Last minute:</span>
                  <span>{status.reads.lastMinute}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last hour:</span>
                  <span>{status.reads.lastHour}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last day:</span>
                  <span>{status.reads.lastDay}</span>
                </div>
              </div>

              {/* Progress bar for reads */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    status.reads.percentageUsed >= 0.9 ? 'bg-red-500' :
                    status.reads.percentageUsed >= 0.8 ? 'bg-orange-500' :
                    status.reads.percentageUsed >= 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(formatPercentage(status.reads.percentageUsed), 100)}%` }}
                />
              </div>
            </div>

            {/* Writes Section */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center justify-between">
                <span>✏️ Writes</span>
                <span className={getStatusColor(status.writes.percentageUsed)}>
                  {formatPercentage(status.writes.percentageUsed)}% used
                </span>
              </div>
              
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Last minute:</span>
                  <span>{status.writes.lastMinute}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last hour:</span>
                  <span>{status.writes.lastHour}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last day:</span>
                  <span>{status.writes.lastDay}</span>
                </div>
              </div>

              {/* Progress bar for writes */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    status.writes.percentageUsed >= 0.9 ? 'bg-red-500' :
                    status.writes.percentageUsed >= 0.8 ? 'bg-orange-500' :
                    status.writes.percentageUsed >= 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(formatPercentage(status.writes.percentageUsed), 100)}%` }}
                />
              </div>
            </div>

            {/* Adaptive Throttling Info */}
            {status.adaptiveDelay > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                <div className="text-xs font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Adaptive Throttling Active
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Delay: {status.adaptiveDelay}ms per operation
                </div>
              </div>
            )}

            {/* Status Indicators */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Status:
              </span>
              <div className="flex items-center gap-2">
                {status.throttled ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-red-500">Throttled</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-green-500">Normal</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  dbManager.resetThrottle();
                  loadStatus();
                }}
                className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              >
                Reset Counters
              </button>
              <button
                onClick={loadStatus}
                className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded transition-colors"
              >
                Refresh
              </button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
              Automatic throttling prevents quota exhaustion
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
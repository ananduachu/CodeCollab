/**
 * Database Status Indicator Component
 * Shows which database adapter is currently active
 */

import { useState, useEffect } from 'react';
import { dbManager } from '../utils/database/dbManager';
import { Database, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

export function DatabaseStatus() {
  const [status, setStatus] = useState<Array<{ name: string; available: boolean; current: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadStatus();
    
    // Refresh status every 30 seconds
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const dbStatus = await dbManager.getStatus();
      setStatus(dbStatus);
    } catch (error) {
      console.error('Failed to load database status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAdapter = async (adapterName: string) => {
    try {
      const success = await dbManager.switchAdapter(adapterName);
      if (success) {
        toast.success(`Switched to ${adapterName}`);
        await loadStatus();
      } else {
        toast.error(`Failed to switch to ${adapterName}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const currentAdapter = status.find(s => s.current);
  
  if (loading) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Collapsed view */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors w-full"
        >
          <Database className="w-4 h-4" />
          <span className="font-medium">
            {currentAdapter?.name || 'Unknown'}
          </span>
          {currentAdapter?.name === 'Firestore' ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-orange-500" />
          )}
        </button>

        {/* Expanded view */}
        {expanded && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Info className="w-3 h-3" />
              <span>Database Adapters</span>
            </div>

            <div className="space-y-2">
              {status.map((adapter) => (
                <div
                  key={adapter.name}
                  className={`flex items-center justify-between p-2 rounded-md text-sm ${
                    adapter.current
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      adapter.available ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="font-medium">{adapter.name}</span>
                    {adapter.current && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        (Active)
                      </span>
                    )}
                  </div>

                  {!adapter.current && adapter.available && (
                    <button
                      onClick={() => handleSwitchAdapter(adapter.name)}
                      className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition-colors"
                    >
                      Switch
                    </button>
                  )}
                </div>
              ))}
            </div>

            {currentAdapter?.name !== 'Firestore' && (
              <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded-md">
                ⚠️ Using fallback database. Data may not sync across devices.
              </div>
            )}

            <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
              Fallback activated when Firestore quota is exceeded
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

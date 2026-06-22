/**
 * Database Manager with Automatic Fallback and Throttling
 * Manages multiple database adapters, automatically switches to fallback when quota is exceeded,
 * and throttles operations to prevent quota exhaustion
 */

import type { DatabaseAdapter } from './dbAdapter';
import { FirestoreAdapter } from './firestoreAdapter';
import { IndexedDBAdapter } from './indexedDBAdapter';
import { db as firestoreDb } from '../firebase/config';
import { executeThrottled } from './throttleManager';
import { toast } from 'sonner';

class DatabaseManager {
  private adapters: DatabaseAdapter[] = [];
  private currentAdapter: DatabaseAdapter | null = null;
  private initPromise: Promise<void> | null = null;
  
  async initialize() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      console.log('🔄 Initializing database manager...');
      
      // Register available adapters in priority order
      this.adapters = [
        new FirestoreAdapter(firestoreDb),
        new IndexedDBAdapter()
      ];
      
      // Find the first available adapter
      for (const adapter of this.adapters) {
        console.log(`🔍 Checking ${adapter.name} availability...`);
        const available = await adapter.isAvailable();
        
        if (available) {
          this.currentAdapter = adapter;
          console.log(`✅ Using ${adapter.name} as primary database`);
          break;
        } else {
          console.log(`❌ ${adapter.name} not available`);
        }
      }
      
      if (!this.currentAdapter) {
        console.error('❌ No database adapter available!');
        throw new Error('No database adapter available');
      }
    })();
    
    return this.initPromise;
  }
  
  getCurrentAdapter(): DatabaseAdapter {
    if (!this.currentAdapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.currentAdapter;
  }
  
  getCurrentAdapterName(): string {
    return this.currentAdapter?.name || 'None';
  }
  
  /**
   * Execute a database operation with automatic fallback and throttling
   */
  async executeWithFallback<T>(
    operation: (adapter: DatabaseAdapter) => Promise<T>,
    operationName: string = 'Database operation',
    operationType: 'read' | 'write' = 'read'
  ): Promise<T> {
    await this.initialize();
    
    // Wrap the operation with throttling
    return executeThrottled(
      async () => {
        const currentIndex = this.adapters.indexOf(this.currentAdapter!);
        
        for (let i = currentIndex; i < this.adapters.length; i++) {
          const adapter = this.adapters[i];
          
          try {
            console.log(`📊 Executing ${operationName} with ${adapter.name}...`);
            const result = await operation(adapter);
            
            // If we switched to a fallback adapter, update current adapter
            if (adapter !== this.currentAdapter) {
              const oldAdapter = this.currentAdapter?.name;
              this.currentAdapter = adapter;
              console.log(`🔄 Switched from ${oldAdapter} to ${adapter.name}`);
              
              toast.warning(
                `Switched to ${adapter.name} database`,
                {
                  description: `${oldAdapter} quota exceeded. Using ${adapter.name} as fallback.`,
                  duration: 5000
                }
              );
            }
            
            return result;
          } catch (error: any) {
            console.error(`❌ ${operationName} failed with ${adapter.name}:`, error);
            
            // Check if it's a quota exceeded error
            if (adapter.isQuotaExceeded(error)) {
              console.warn(`⚠️  ${adapter.name} quota exceeded!`);
              
              // Try next adapter
              if (i < this.adapters.length - 1) {
                const nextAdapter = this.adapters[i + 1];
                console.log(`🔄 Falling back to ${nextAdapter.name}...`);
                
                toast.warning(
                  `${adapter.name} quota exceeded`,
                  {
                    description: `Switching to ${nextAdapter.name}...`,
                    duration: 3000
                  }
                );
                
                continue;
              } else {
                // No more fallbacks available
                console.error('❌ All database adapters exhausted!');
                toast.error(
                  'All databases exhausted',
                  {
                    description: 'Unable to perform operation. Please try again later.',
                    duration: 5000
                  }
                );
                throw new Error('All database adapters have exceeded their quota');
              }
            }
            
            // If it's not a quota error, throw immediately
            throw error;
          }
        }
        
        throw new Error('Failed to execute operation with any adapter');
      },
      operationType,
      operationName
    );
  }
  
  /**
   * Force switch to a specific adapter (useful for testing or manual override)
   */
  async switchAdapter(adapterName: string): Promise<boolean> {
    await this.initialize();
    
    const adapter = this.adapters.find(a => a.name === adapterName);
    if (!adapter) {
      console.error(`Adapter ${adapterName} not found`);
      return false;
    }
    
    const available = await adapter.isAvailable();
    if (!available) {
      console.error(`Adapter ${adapterName} not available`);
      return false;
    }
    
    this.currentAdapter = adapter;
    console.log(`✅ Manually switched to ${adapterName}`);
    
    toast.success(`Switched to ${adapterName}`);
    return true;
  }
  
  /**
   * Get status of all adapters and throttling
   */
  async getStatus(): Promise<Array<{ name: string; available: boolean; current: boolean }>> {
    await this.initialize();
    
    const status = await Promise.all(
      this.adapters.map(async (adapter) => ({
        name: adapter.name,
        available: await adapter.isAvailable(),
        current: adapter === this.currentAdapter
      }))
    );
    
    return status;
  }

  /**
   * Get throttling status
   */
  getThrottleStatus() {
    const { throttleManager } = require('./throttleManager');
    return throttleManager.getStatus();
  }

  /**
   * Update throttle configuration
   */
  updateThrottleConfig(config: any) {
    const { throttleManager } = require('./throttleManager');
    return throttleManager.updateConfig(config);
  }

  /**
   * Reset throttle counters
   */
  resetThrottle() {
    const { throttleManager } = require('./throttleManager');
    return throttleManager.reset();
  }
}

// Export singleton instance
export const dbManager = new DatabaseManager();

// Export convenience functions
export async function getDatabase(): Promise<DatabaseAdapter> {
  await dbManager.initialize();
  return dbManager.getCurrentAdapter();
}

export async function executeWithFallback<T>(
  operation: (adapter: DatabaseAdapter) => Promise<T>,
  operationName?: string,
  operationType: 'read' | 'write' = 'read'
): Promise<T> {
  return dbManager.executeWithFallback(operation, operationName, operationType);
}

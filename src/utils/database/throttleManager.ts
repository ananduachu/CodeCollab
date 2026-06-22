/**
 * Database Throttle Manager
 * Automatically limits database reads/writes to prevent quota exhaustion
 */

import { toast } from 'sonner';

interface ThrottleConfig {
  // Maximum operations per minute
  maxReadsPerMinute: number;
  maxWritesPerMinute: number;
  // Maximum operations per hour
  maxReadsPerHour: number;
  maxWritesPerHour: number;
  // Maximum operations per day
  maxReadsPerDay: number;
  maxWritesPerDay: number;
  // Warning thresholds (percentage of limit)
  warningThreshold: number;
  // Enable adaptive throttling based on error rates
  adaptiveThrottling: boolean;
}

interface OperationRecord {
  timestamp: number;
  type: 'read' | 'write';
  success: boolean;
}

interface ThrottleStatus {
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

class DatabaseThrottleManager {
  private config: ThrottleConfig;
  private operations: OperationRecord[] = [];
  private isThrottled = false;
  private adaptiveDelay = 0;
  private errorRateWindow = 60000; // 1 minute window for error rate calculation
  private maxErrorRate = 0.1; // 10% error rate triggers adaptive throttling

  // Default configuration for Firestore free tier
  private defaultConfig: ThrottleConfig = {
    maxReadsPerMinute: 100,      // Conservative limit
    maxWritesPerMinute: 50,      // Conservative limit  
    maxReadsPerHour: 3000,       // Conservative hourly limit
    maxWritesPerHour: 1500,      // Conservative hourly limit
    maxReadsPerDay: 45000,       // Stay under 50K daily limit
    maxWritesPerDay: 20000,      // Conservative daily limit
    warningThreshold: 0.8,       // Warn at 80% of limit
    adaptiveThrottling: true
  };

  constructor(config?: Partial<ThrottleConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.startCleanupInterval();
    console.log('🚦 Database throttle manager initialized with config:', this.config);
  }

  /**
   * Check if an operation should be throttled
   */
  async shouldThrottle(operationType: 'read' | 'write'): Promise<{ allowed: boolean; reason?: string; delay?: number }> {
    this.cleanupOldOperations();
    
    const counts = this.getOperationCounts(operationType);
    
    // Check against limits
    const limits = operationType === 'read' 
      ? {
          perMinute: this.config.maxReadsPerMinute,
          perHour: this.config.maxReadsPerHour,
          perDay: this.config.maxReadsPerDay
        }
      : {
          perMinute: this.config.maxWritesPerMinute,
          perHour: this.config.maxWritesPerHour,
          perDay: this.config.maxWritesPerDay
        };

    // Check minute limit
    if (counts.lastMinute >= limits.perMinute) {
      return {
        allowed: false,
        reason: `${operationType} limit exceeded: ${counts.lastMinute}/${limits.perMinute} per minute`,
        delay: 60000 // Wait 1 minute
      };
    }

    // Check hour limit
    if (counts.lastHour >= limits.perHour) {
      return {
        allowed: false,
        reason: `${operationType} limit exceeded: ${counts.lastHour}/${limits.perHour} per hour`,
        delay: 3600000 // Wait 1 hour
      };
    }

    // Check daily limit
    if (counts.lastDay >= limits.perDay) {
      return {
        allowed: false,
        reason: `${operationType} limit exceeded: ${counts.lastDay}/${limits.perDay} per day`,
        delay: 86400000 // Wait 24 hours
      };
    }

    // Check warning thresholds
    const minutePercentage = counts.lastMinute / limits.perMinute;
    const hourPercentage = counts.lastHour / limits.perHour;
    const dayPercentage = counts.lastDay / limits.perDay;

    if (minutePercentage >= this.config.warningThreshold) {
      this.showWarning(operationType, 'minute', minutePercentage);
    } else if (hourPercentage >= this.config.warningThreshold) {
      this.showWarning(operationType, 'hour', hourPercentage);
    } else if (dayPercentage >= this.config.warningThreshold) {
      this.showWarning(operationType, 'day', dayPercentage);
    }

    // Apply adaptive throttling if enabled
    if (this.config.adaptiveThrottling && this.adaptiveDelay > 0) {
      await this.wait(this.adaptiveDelay);
    }

    return { allowed: true };
  }

  /**
   * Execute a database operation with throttling
   */
  async executeThrottled<T>(
    operation: () => Promise<T>,
    operationType: 'read' | 'write',
    operationName: string = 'Database operation'
  ): Promise<T> {
    const throttleCheck = await this.shouldThrottle(operationType);
    
    if (!throttleCheck.allowed) {
      console.warn(`🚦 Operation throttled: ${throttleCheck.reason}`);
      
      toast.warning(
        `Database ${operationType} throttled`,
        {
          description: throttleCheck.reason,
          duration: 5000
        }
      );

      if (throttleCheck.delay) {
        console.log(`⏱️ Waiting ${throttleCheck.delay}ms before retry...`);
        await this.wait(Math.min(throttleCheck.delay, 10000)); // Max 10 second wait for UX
      }

      throw new Error(`Operation throttled: ${throttleCheck.reason}`);
    }

    const startTime = Date.now();
    let success = false;

    try {
      console.log(`🚦 Executing throttled ${operationType}: ${operationName}`);
      const result = await operation();
      success = true;
      return result;
    } catch (error) {
      success = false;
      this.handleOperationError(error);
      throw error;
    } finally {
      // Record the operation
      this.recordOperation(operationType, success);
      
      // Update adaptive throttling
      if (this.config.adaptiveThrottling) {
        this.updateAdaptiveThrottling();
      }

      const duration = Date.now() - startTime;
      console.log(`🚦 ${operationType} operation completed in ${duration}ms, success: ${success}`);
    }
  }

  /**
   * Get current throttle status
   */
  getStatus(): ThrottleStatus {
    this.cleanupOldOperations();
    
    const readCounts = this.getOperationCounts('read');
    const writeCounts = this.getOperationCounts('write');

    return {
      reads: {
        lastMinute: readCounts.lastMinute,
        lastHour: readCounts.lastHour,
        lastDay: readCounts.lastDay,
        percentageUsed: Math.max(
          readCounts.lastMinute / this.config.maxReadsPerMinute,
          readCounts.lastHour / this.config.maxReadsPerHour,
          readCounts.lastDay / this.config.maxReadsPerDay
        )
      },
      writes: {
        lastMinute: writeCounts.lastMinute,
        lastHour: writeCounts.lastHour,
        lastDay: writeCounts.lastDay,
        percentageUsed: Math.max(
          writeCounts.lastMinute / this.config.maxWritesPerMinute,
          writeCounts.lastHour / this.config.maxWritesPerHour,
          writeCounts.lastDay / this.config.maxWritesPerDay
        )
      },
      throttled: this.isThrottled,
      adaptiveDelay: this.adaptiveDelay
    };
  }

  /**
   * Update throttle configuration
   */
  updateConfig(newConfig: Partial<ThrottleConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log('🚦 Throttle configuration updated:', this.config);
  }

  /**
   * Reset throttle counters (useful for testing or manual reset)
   */
  reset() {
    this.operations = [];
    this.isThrottled = false;
    this.adaptiveDelay = 0;
    console.log('🚦 Throttle manager reset');
  }

  private recordOperation(type: 'read' | 'write', success: boolean) {
    this.operations.push({
      timestamp: Date.now(),
      type,
      success
    });
  }

  private getOperationCounts(type: 'read' | 'write') {
    const now = Date.now();
    const operations = this.operations.filter(op => op.type === type);

    return {
      lastMinute: operations.filter(op => now - op.timestamp <= 60000).length,
      lastHour: operations.filter(op => now - op.timestamp <= 3600000).length,
      lastDay: operations.filter(op => now - op.timestamp <= 86400000).length
    };
  }

  private cleanupOldOperations() {
    const now = Date.now();
    // Keep operations from the last 24 hours
    this.operations = this.operations.filter(op => now - op.timestamp <= 86400000);
  }

  private startCleanupInterval() {
    // Clean up old operations every 5 minutes
    setInterval(() => {
      this.cleanupOldOperations();
    }, 300000);
  }

  private showWarning(operationType: 'read' | 'write', period: string, percentage: number) {
    const percentDisplay = Math.round(percentage * 100);
    console.warn(`⚠️ ${operationType} usage at ${percentDisplay}% of ${period} limit`);
    
    if (percentage >= 0.9) { // 90% threshold for critical warning
      toast.error(
        `Critical: ${operationType} limit almost reached`,
        {
          description: `${percentDisplay}% of ${period} quota used. Consider reducing operations.`,
          duration: 8000
        }
      );
    } else if (percentage >= this.config.warningThreshold) {
      toast.warning(
        `Warning: High ${operationType} usage`,
        {
          description: `${percentDisplay}% of ${period} quota used.`,
          duration: 5000
        }
      );
    }
  }

  private handleOperationError(error: any) {
    // Check if it's a quota-related error and adjust adaptive throttling
    if (this.isQuotaError(error)) {
      this.adaptiveDelay = Math.min(this.adaptiveDelay + 1000, 10000); // Increase delay up to 10s
      console.log(`🚦 Quota error detected, increasing adaptive delay to ${this.adaptiveDelay}ms`);
    }
  }

  private updateAdaptiveThrottling() {
    if (!this.config.adaptiveThrottling) return;

    const now = Date.now();
    const recentOperations = this.operations.filter(op => now - op.timestamp <= this.errorRateWindow);
    
    if (recentOperations.length === 0) return;

    const errorRate = recentOperations.filter(op => !op.success).length / recentOperations.length;

    if (errorRate > this.maxErrorRate) {
      // Increase delay if error rate is high
      this.adaptiveDelay = Math.min(this.adaptiveDelay + 500, 5000);
      console.log(`🚦 High error rate (${(errorRate * 100).toFixed(1)}%), increasing delay to ${this.adaptiveDelay}ms`);
    } else if (errorRate < this.maxErrorRate / 2) {
      // Decrease delay if error rate is low
      this.adaptiveDelay = Math.max(this.adaptiveDelay - 100, 0);
      if (this.adaptiveDelay === 0) {
        console.log('🚦 Low error rate, adaptive throttling disabled');
      }
    }
  }

  private isQuotaError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code;
    
    return (
      errorCode === 8 || // gRPC RESOURCE_EXHAUSTED
      errorCode === 'resource-exhausted' ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('resource_exhausted') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const throttleManager = new DatabaseThrottleManager();

// Export convenience functions
export async function executeThrottled<T>(
  operation: () => Promise<T>,
  operationType: 'read' | 'write',
  operationName?: string
): Promise<T> {
  return throttleManager.executeThrottled(operation, operationType, operationName);
}

export function getThrottleStatus() {
  return throttleManager.getStatus();
}

export function updateThrottleConfig(config: Partial<ThrottleConfig>) {
  return throttleManager.updateConfig(config);
}

export function resetThrottle() {
  return throttleManager.reset();
}
/**
 * IndexedDB Database Adapter
 * Provides a fallback database using browser's IndexedDB when Firestore quota is exceeded
 */

import type { 
  DatabaseAdapter, 
  CollectionAdapter, 
  DocumentAdapter, 
  DocumentSnapshotAdapter 
} from './dbAdapter';

const DB_NAME = 'CodeCollabDB';
const DB_VERSION = 1;

export class IndexedDBAdapter implements DatabaseAdapter {
  name = 'IndexedDB';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false;
    }
    
    try {
      await this.initialize();
      return true;
    } catch (error) {
      console.error('IndexedDB availability check failed:', error);
      return false;
    }
  }
  
  private async initialize(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        // Create object stores for each collection type
        const collections = [
          'projects', 
          'files', 
          'messages', 
          'presence', 
          'users',
          'collaborators',
          'invitations'
        ];
        
        collections.forEach(collectionName => {
          if (!db.objectStoreNames.contains(collectionName)) {
            const store = db.createObjectStore(collectionName, { keyPath: 'id' });
            // Create indexes for common queries
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        });
      };
    });
    
    return this.initPromise;
  }
  
  collection(path: string): CollectionAdapter {
    return new IndexedDBCollectionAdapter(this, path);
  }
  
  doc(path: string): DocumentAdapter {
    const parts = path.split('/');
    const collectionPath = parts.slice(0, -1).join('/');
    const docId = parts[parts.length - 1];
    return new IndexedDBDocumentAdapter(this, collectionPath, docId);
  }
  
  isQuotaExceeded(error: any): boolean {
    return (
      error?.name === 'QuotaExceededError' ||
      error?.code === 22 ||
      error?.message?.includes('quota')
    );
  }
  
  async getDB(): Promise<IDBDatabase> {
    return this.initialize();
  }
}

class IndexedDBCollectionAdapter implements CollectionAdapter {
  private adapter: IndexedDBAdapter;
  private path: string;
  private whereConstraints: Array<{ field: string; operator: string; value: any }> = [];
  private orderByConstraints: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
  private limitConstraint: number | null = null;
  
  constructor(adapter: IndexedDBAdapter, path: string) {
    this.adapter = adapter;
    this.path = path;
  }
  
  doc(id: string): DocumentAdapter {
    return new IndexedDBDocumentAdapter(this.adapter, this.path, id);
  }
  
  async add(data: any): Promise<{ id: string }> {
    const db = await this.adapter.getDB();
    const id = this.generateId();
    const document = {
      id,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.path], 'readwrite');
      const store = transaction.objectStore(this.path);
      const request = store.add(document);
      
      request.onsuccess = () => resolve({ id });
      request.onerror = () => reject(request.error);
    });
  }
  
  async get(): Promise<{ docs: DocumentSnapshotAdapter[] }> {
    const db = await this.adapter.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.path], 'readonly');
      const store = transaction.objectStore(this.path);
      const request = store.getAll();
      
      request.onsuccess = () => {
        let results = request.result || [];
        
        // Apply where constraints
        this.whereConstraints.forEach(constraint => {
          results = results.filter(doc => {
            const value = this.getNestedValue(doc, constraint.field);
            switch (constraint.operator) {
              case '==': return value === constraint.value;
              case '!=': return value !== constraint.value;
              case '<': return value < constraint.value;
              case '<=': return value <= constraint.value;
              case '>': return value > constraint.value;
              case '>=': return value >= constraint.value;
              case 'array-contains': return Array.isArray(value) && value.includes(constraint.value);
              default: return true;
            }
          });
        });
        
        // Apply orderBy
        if (this.orderByConstraints.length > 0) {
          results.sort((a, b) => {
            for (const orderBy of this.orderByConstraints) {
              const aVal = this.getNestedValue(a, orderBy.field);
              const bVal = this.getNestedValue(b, orderBy.field);
              const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
              if (comparison !== 0) {
                return orderBy.direction === 'desc' ? -comparison : comparison;
              }
            }
            return 0;
          });
        }
        
        // Apply limit
        if (this.limitConstraint !== null) {
          results = results.slice(0, this.limitConstraint);
        }
        
        const docs = results.map(doc => ({
          id: doc.id,
          exists: true,
          data: () => doc
        }));
        
        resolve({ docs });
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  where(field: string, operator: string, value: any): CollectionAdapter {
    this.whereConstraints.push({ field, operator, value });
    return this;
  }
  
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): CollectionAdapter {
    this.orderByConstraints.push({ field, direction });
    return this;
  }
  
  limit(count: number): CollectionAdapter {
    this.limitConstraint = count;
    return this;
  }
  
  onSnapshot(callback: (snapshot: any) => void): () => void {
    // IndexedDB doesn't have native real-time listeners
    // We'll use polling as a fallback
    let active = true;
    
    const poll = async () => {
      if (!active) return;
      
      try {
        const snapshot = await this.get();
        callback(snapshot);
      } catch (error) {
        console.error('IndexedDB snapshot poll error:', error);
      }
      
      if (active) {
        setTimeout(poll, 2000); // Poll every 2 seconds
      }
    };
    
    poll();
    
    return () => {
      active = false;
    };
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class IndexedDBDocumentAdapter implements DocumentAdapter {
  private adapter: IndexedDBAdapter;
  private collectionPath: string;
  private docId: string;
  
  constructor(adapter: IndexedDBAdapter, collectionPath: string, docId: string) {
    this.adapter = adapter;
    this.collectionPath = collectionPath;
    this.docId = docId;
  }
  
  async get(): Promise<DocumentSnapshotAdapter> {
    const db = await this.adapter.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.collectionPath], 'readonly');
      const store = transaction.objectStore(this.collectionPath);
      const request = store.get(this.docId);
      
      request.onsuccess = () => {
        const data = request.result;
        resolve({
          id: this.docId,
          exists: !!data,
          data: () => data || null
        });
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async set(data: any, options?: any): Promise<void> {
    const db = await this.adapter.getDB();
    const document = {
      id: this.docId,
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    // Add createdAt if it's a new document (merge: false)
    if (!options?.merge) {
      document.createdAt = new Date().toISOString();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.collectionPath], 'readwrite');
      const store = transaction.objectStore(this.collectionPath);
      const request = store.put(document);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async update(data: any): Promise<void> {
    const db = await this.adapter.getDB();
    const existing = await this.get();
    
    if (!existing.exists) {
      throw new Error('Document does not exist');
    }
    
    const document = {
      ...existing.data(),
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.collectionPath], 'readwrite');
      const store = transaction.objectStore(this.collectionPath);
      const request = store.put(document);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async delete(): Promise<void> {
    const db = await this.adapter.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.collectionPath], 'readwrite');
      const store = transaction.objectStore(this.collectionPath);
      const request = store.delete(this.docId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  onSnapshot(callback: (snapshot: any) => void): () => void {
    let active = true;
    
    const poll = async () => {
      if (!active) return;
      
      try {
        const snapshot = await this.get();
        callback(snapshot);
      } catch (error) {
        console.error('IndexedDB document snapshot poll error:', error);
      }
      
      if (active) {
        setTimeout(poll, 2000);
      }
    };
    
    poll();
    
    return () => {
      active = false;
    };
  }
}

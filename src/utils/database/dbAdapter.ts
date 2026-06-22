/**
 * Database Adapter - Abstraction layer for multiple database backends
 * Provides automatic fallback when Firestore quota is exceeded
 */

export interface DatabaseAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  
  // Collection operations
  collection(path: string): CollectionAdapter;
  
  // Document operations
  doc(path: string): DocumentAdapter;
  
  // Error handling
  isQuotaExceeded(error: any): boolean;
}

export interface CollectionAdapter {
  doc(id: string): DocumentAdapter;
  add(data: any): Promise<{ id: string }>;
  get(): Promise<{ docs: DocumentSnapshotAdapter[] }>;
  where(field: string, operator: string, value: any): CollectionAdapter;
  orderBy(field: string, direction?: 'asc' | 'desc'): CollectionAdapter;
  limit(count: number): CollectionAdapter;
  onSnapshot(callback: (snapshot: any) => void): () => void;
}

export interface DocumentAdapter {
  get(): Promise<DocumentSnapshotAdapter>;
  set(data: any, options?: any): Promise<void>;
  update(data: any): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(callback: (snapshot: any) => void): () => void;
}

export interface DocumentSnapshotAdapter {
  id: string;
  exists: boolean;
  data(): any;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

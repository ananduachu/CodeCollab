/**
 * Firestore Database Adapter
 * Wraps Firebase Firestore with the common database interface
 */

import { 
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  addDoc,
  query,
  where as firestoreWhere,
  orderBy as firestoreOrderBy,
  limit as firestoreLimit,
  onSnapshot,
  Firestore
} from 'firebase/firestore';

import type { 
  DatabaseAdapter, 
  CollectionAdapter, 
  DocumentAdapter, 
  DocumentSnapshotAdapter
} from './dbAdapter';

export class FirestoreAdapter implements DatabaseAdapter {
  name = 'Firestore';
  private db: Firestore;
  
  constructor(db: Firestore) {
    this.db = db;
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Try a simple operation to check if Firestore is available
      const testRef = firestoreDoc(this.db, '_health_check', 'test');
      await getDoc(testRef);
      return true;
    } catch (error: any) {
      console.error('Firestore availability check failed:', error);
      return false;
    }
  }
  
  collection(path: string): CollectionAdapter {
    return new FirestoreCollectionAdapter(this.db, path);
  }
  
  doc(path: string): DocumentAdapter {
    const parts = path.split('/');
    const collectionPath = parts.slice(0, -1).join('/');
    const docId = parts[parts.length - 1];
    return new FirestoreDocumentAdapter(this.db, collectionPath, docId);
  }
  
  isQuotaExceeded(error: any): boolean {
    // Check for various quota exceeded error patterns
    return (
      error?.code === 'resource-exhausted' ||
      error?.code === 'RESOURCE_EXHAUSTED' ||
      error?.message?.includes('Quota exceeded') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.code === 8 // gRPC error code for RESOURCE_EXHAUSTED
    );
  }
}

class FirestoreCollectionAdapter implements CollectionAdapter {
  private db: Firestore;
  private path: string;
  private queryConstraints: any[] = [];
  
  constructor(db: Firestore, path: string) {
    this.db = db;
    this.path = path;
  }
  
  doc(id: string): DocumentAdapter {
    return new FirestoreDocumentAdapter(this.db, this.path, id);
  }
  
  async add(data: any): Promise<{ id: string }> {
    const collectionRef = firestoreCollection(this.db, this.path);
    const docRef = await addDoc(collectionRef, {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { id: docRef.id };
  }
  
  async get(): Promise<{ docs: DocumentSnapshotAdapter[] }> {
    const collectionRef = firestoreCollection(this.db, this.path);
    const q = this.queryConstraints.length > 0 
      ? query(collectionRef, ...this.queryConstraints)
      : collectionRef;
    
    const snapshot = await getDocs(q as any);
    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      exists: doc.exists(),
      data: () => doc.data()
    }));
    
    return { docs };
  }
  
  where(field: string, operator: string, value: any): CollectionAdapter {
    this.queryConstraints.push(firestoreWhere(field, operator as any, value));
    return this;
  }
  
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): CollectionAdapter {
    this.queryConstraints.push(firestoreOrderBy(field, direction));
    return this;
  }
  
  limit(count: number): CollectionAdapter {
    this.queryConstraints.push(firestoreLimit(count));
    return this;
  }
  
  onSnapshot(callback: (snapshot: any) => void): () => void {
    const collectionRef = firestoreCollection(this.db, this.path);
    const q = this.queryConstraints.length > 0 
      ? query(collectionRef, ...this.queryConstraints)
      : collectionRef;
    
    return onSnapshot(q as any, (snapshot: any) => {
      const docs = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        exists: doc.exists(),
        data: () => doc.data()
      }));
      callback({ docs });
    });
  }
}

class FirestoreDocumentAdapter implements DocumentAdapter {
  private db: Firestore;
  private collectionPath: string;
  private docId: string;
  
  constructor(db: Firestore, collectionPath: string, docId: string) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.docId = docId;
  }
  
  private getRef() {
    return firestoreDoc(this.db, this.collectionPath, this.docId);
  }
  
  async get(): Promise<DocumentSnapshotAdapter> {
    const docRef = this.getRef();
    const snapshot = await getDoc(docRef);
    
    return {
      id: snapshot.id,
      exists: snapshot.exists(),
      data: () => snapshot.data()
    };
  }
  
  async set(data: any, options?: any): Promise<void> {
    const docRef = this.getRef();
    await setDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    }, options);
  }
  
  async update(data: any): Promise<void> {
    const docRef = this.getRef();
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  }
  
  async delete(): Promise<void> {
    const docRef = this.getRef();
    await deleteDoc(docRef);
  }
  
  onSnapshot(callback: (snapshot: any) => void): () => void {
    const docRef = this.getRef();
    return onSnapshot(docRef, (snapshot) => {
      callback({
        id: snapshot.id,
        exists: snapshot.exists(),
        data: () => snapshot.data()
      });
    });
  }
}

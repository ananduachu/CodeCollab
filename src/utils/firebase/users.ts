import { User as FirebaseUser } from 'firebase/auth';
import { executeWithFallback } from '../database/dbManager';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: any;
  updatedAt: any;
}

/**
 * Create or update user profile in database
 * OPTIMIZATION: Only creates/updates on first login or when data changes
 * Uses automatic fallback when Firestore quota is exceeded
 */
export const createOrUpdateUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile> => {
  try {
    return await executeWithFallback(async (db) => {
      const userRef = db.doc(`users/${firebaseUser.uid}`);
      
      // Check if user already exists
      const userSnap = await userRef.get();
      
      // Build user data object, excluding undefined values
      const userData: any = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        updatedAt: new Date().toISOString(),
      };

      // Only add displayName if it exists
      if (firebaseUser.displayName) {
        userData.displayName = firebaseUser.displayName;
      }

      // Only add avatarUrl if it exists
      if (firebaseUser.photoURL) {
        userData.avatarUrl = firebaseUser.photoURL;
      }

      if (userSnap.exists) {
        // OPTIMIZATION: Only update if data has changed
        const existingData = userSnap.data();
        const hasChanges = 
          existingData.displayName !== firebaseUser.displayName ||
          existingData.avatarUrl !== firebaseUser.photoURL ||
          existingData.email !== firebaseUser.email;
        
        if (hasChanges) {
          await userRef.update(userData);
          console.log('✅ Updated existing user profile:', firebaseUser.uid);
        } else {
          console.log('✅ User profile unchanged, skipping update:', firebaseUser.uid);
        }
      } else {
        // Create new user
        await userRef.set({
          ...userData,
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Created new user profile:', firebaseUser.uid);
      }

      return {
        ...userData,
        createdAt: userSnap.exists ? userSnap.data()?.createdAt : new Date().toISOString(),
      } as UserProfile;
    }, 'Create/Update User Profile', 'write'); // Mark as write operation for throttling
  } catch (error: any) {
    console.error('⚠️ Error creating/updating user profile:', error);
    // If it's a network error or blocked by client, return a basic profile
    // This allows the app to continue functioning even if database is blocked
    if (error.code === 'unavailable' || error.message?.includes('ERR_BLOCKED_BY_CLIENT')) {
      console.warn('📡 Database blocked or unavailable, returning basic user profile');
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        displayName: firebaseUser.displayName || undefined,
        avatarUrl: firebaseUser.photoURL || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as UserProfile;
    }
    throw error;
  }
};

/**
 * Get user profile from database
 * Uses automatic fallback when Firestore quota is exceeded
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    return await executeWithFallback(async (db) => {
      const userRef = db.doc(`users/${uid}`);
      const userSnap = await userRef.get();
      
      if (userSnap.exists) {
        return userSnap.data() as UserProfile;
      }
      
      return null;
    }, 'Get User Profile', 'read'); // Mark as read operation for throttling
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

/**
 * Update user profile
 * Uses automatic fallback when Firestore quota is exceeded
 */
export const updateUserProfile = async (
  uid: string, 
  updates: Partial<Pick<UserProfile, 'displayName' | 'avatarUrl'>>
): Promise<void> => {
  try {
    await executeWithFallback(async (db) => {
      const userRef = db.doc(`users/${uid}`);
      
      // Filter out undefined values
      const cleanUpdates: any = {
        updatedAt: new Date().toISOString(),
      };
      
      if (updates.displayName !== undefined) {
        cleanUpdates.displayName = updates.displayName;
      }
      
      if (updates.avatarUrl !== undefined) {
        cleanUpdates.avatarUrl = updates.avatarUrl;
      }
      
      await userRef.update(cleanUpdates);
      console.log('✅ Updated user profile:', uid);
    }, 'Update User Profile', 'write'); // Mark as write operation for throttling
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};
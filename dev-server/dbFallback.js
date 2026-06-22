/**
 * Server-side Database Manager with Fallback
 * Handles Firestore quota exceeded errors and falls back to in-memory storage
 */

// Check if error is a quota exceeded error
const isQuotaExceeded = (error) => {
  return (
    error?.code === 'resource-exhausted' ||
    error?.code === 8 || // gRPC error code
    error?.message?.includes('Quota exceeded') ||
    error?.message?.includes('RESOURCE_EXHAUSTED')
  );
};

// Check if error is a permission denied error
const isPermissionDenied = (error) => {
  return (
    error?.code === 'permission-denied' ||
    error?.code === 7 || // gRPC error code
    error?.message?.includes('Permission denied') ||
    error?.message?.includes('PERMISSION_DENIED')
  );
};

// Database operation wrapper with automatic fallback
async function executeWithFallback(firestoreOperation, mockOperation, operationName = 'Operation') {
  // If Firestore is not available, use mock immediately
  if (!global.firestoreAvailable) {
    console.log(`📦 Using in-memory storage for ${operationName}`);
    return mockOperation();
  }
  
  try {
    console.log(`🔥 Attempting ${operationName} with Firestore...`);
    const result = await firestoreOperation();
    console.log(`✅ ${operationName} succeeded with Firestore`);
    return result;
  } catch (error) {
    console.error(`❌ ${operationName} failed with Firestore:`, error.message);
    
    // Check if it's a quota exceeded error
    if (isQuotaExceeded(error)) {
      console.warn(`⚠️  Firestore quota exceeded! Falling back to in-memory storage for ${operationName}`);
      
      // Mark Firestore as unavailable for subsequent requests
      global.firestoreAvailable = false;
      
      // Log warning
      console.log('🔄 All subsequent requests will use in-memory storage until server restart');
      
      // Execute with mock storage
      return mockOperation();
    }
    
    // Check if it's a permission denied error (security rules issue)
    if (isPermissionDenied(error)) {
      console.warn(`⚠️  Firestore permission denied! Falling back to in-memory storage for ${operationName}`);
      console.warn('   This might be due to security rules. Check firestore.rules file.');
      
      // Fall back to mock storage
      return mockOperation();
    }
    
    // For other errors, throw them
    throw error;
  }
}

module.exports = {
  executeWithFallback,
  isQuotaExceeded,
  isPermissionDenied
};

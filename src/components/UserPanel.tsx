import { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code, Crown, MoreHorizontal, Trash2, RefreshCw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProject } from '../hooks/useProject';
import { ShareModal } from './ShareModal';
import { JoinCollaboration } from './JoinCollaboration';
import { RoleSelector } from './RoleSelector';
import { useAuth } from './AuthWrapper';
import { Project } from '../hooks/useProject';

interface UserPresence {
  user_id: string;
  user_name: string;
  user_avatar: string;
  file: string | null;
  cursor: any;
  last_seen: string;
}

interface UserPanelProps {
  users: UserPresence[];
  project?: Project;
  projectId?: string;
  projectName?: string;
  isOwner?: boolean;
}

export function UserPanel({ users, project, projectId, projectName, isOwner = false }: UserPanelProps) {
  const { removeCollaborator, updateCollaboratorRole, getProjectCollaborators, selectProject, syncWorkspaceState } = useProject();
  const { session } = useAuth();
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [syncingWorkspace, setSyncingWorkspace] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fastPollingRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const getRandomColor = (userId: string) => {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const formatLastSeen = (lastSeenString: string) => {
    const lastSeen = new Date(lastSeenString);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Enhanced loadCollaborators with caching, error recovery, and retry logic
  const loadCollaborators = useCallback(async (forceRefresh = false) => {
    if (!projectId) return;
    
    // Cache key for localStorage
    const cacheKey = `collaborators_${projectId}`;
    
    // Try to load from cache first (if not forcing refresh)
    if (!forceRefresh && !loadingCollaborators) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          // Use cache if less than 30 seconds old
          if (age < 30000) {
            console.log('📦 Using cached collaborators (age:', age, 'ms)');
            setCollaborators(data);
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to load cached collaborators:', error);
      }
    }
    
    setLoadingCollaborators(true);
    try {
      console.log('🔄 Fetching collaborators for project:', projectId);
      const projectCollaborators = await getProjectCollaborators(projectId);
      
      // Update state
      setCollaborators(projectCollaborators);
      setRetryCount(0); // Reset retry count on success
      
      // Cache the result
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data: projectCollaborators,
          timestamp: Date.now()
        }));
        console.log('✅ Collaborators cached successfully');
      } catch (cacheError) {
        console.warn('Failed to cache collaborators:', cacheError);
      }
      
    } catch (error) {
      console.error('❌ Failed to load collaborators:', error);
      
      // Increment retry count
      setRetryCount(prev => prev + 1);
      
      // Implement exponential backoff for retries
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
      
      console.log(`⏱️ Scheduling retry in ${backoffDelay}ms (attempt ${retryCount + 1})`);
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      retryTimeoutRef.current = setTimeout(() => {
        loadCollaborators(true);
      }, backoffDelay);
      
      // Try to use cached data as fallback
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data } = JSON.parse(cached);
          console.log('📦 Using stale cached data as fallback');
          setCollaborators(data);
        }
      } catch (cacheError) {
        console.warn('No cached data available');
      }
    } finally {
      setLoadingCollaborators(false);
    }
  }, [projectId, loadingCollaborators, retryCount]);

  const handleRemoveCollaborator = async (collaboratorId: string, collaboratorName: string) => {
    if (!projectId || !isOwner) return;
    
    try {
      await removeCollaborator(projectId, collaboratorId);
      toast.success(`Removed ${collaboratorName} from project`);
      // Immediate refresh after removal
      await loadCollaborators(true);
      // Start fast polling for 30 seconds to catch any sync issues
      startFastPolling();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove collaborator');
    }
  };

  const handleRoleChange = async (collaboratorId: string, newRole: 'editor' | 'viewer') => {
    if (!projectId || !isOwner) return;
    
    try {
      await updateCollaboratorRole(projectId, collaboratorId, newRole);
      // Immediate refresh after role change
      await loadCollaborators(true);
      // Start fast polling for 30 seconds to catch any sync issues
      startFastPolling();
    } catch (error: any) {
      console.error('Failed to update role:', error);
      throw error; // Re-throw so RoleSelector can handle the error display
    }
  };

  const handleProjectJoined = async (joinedProject: any) => {
    // Switch to the newly joined project
    await selectProject(joinedProject);
    toast.success(`Switched to "${joinedProject.name}"`);
    // Force refresh collaborators for new project
    await loadCollaborators(true);
    // Start fast polling for the first minute
    startFastPolling();
  };

  const handleSyncWorkspace = async () => {
    if (!projectId) return;
    
    setSyncingWorkspace(true);
    try {
      await syncWorkspaceState(projectId);
      toast.success('Workspace synchronized successfully!');
      // Force refresh after sync
      await loadCollaborators(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync workspace');
    } finally {
      setSyncingWorkspace(false);
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    console.log('🔄 Manual refresh triggered');
    await loadCollaborators(true);
    toast.success('Collaborators list refreshed');
  };

  // Start fast polling (every 2 seconds for 30 seconds)
  const startFastPolling = useCallback(() => {
    console.log('⚡ Starting fast polling for 30 seconds');
    
    // Clear any existing fast polling
    if (fastPollingRef.current) {
      clearInterval(fastPollingRef.current);
    }
    
    // OPTIMIZED: Fast polling every 5 seconds instead of 2 (60% reduction)
    fastPollingRef.current = setInterval(() => {
      loadCollaborators(true);
    }, 5000); // Every 5 seconds (was 2s)
    
    // Stop fast polling after 30 seconds
    setTimeout(() => {
      if (fastPollingRef.current) {
        clearInterval(fastPollingRef.current);
        fastPollingRef.current = null;
        console.log('⚡ Fast polling stopped');
      }
    }, 30000);
  }, [loadCollaborators]);

  // Handle visibility change (tab becomes active/inactive)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible' && projectId) {
      console.log('👁️ Tab became visible, refreshing collaborators');
      loadCollaborators(true);
    }
  }, [projectId, loadCollaborators]);

  // Cleanup function for all intervals and timeouts
  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (fastPollingRef.current) {
      clearInterval(fastPollingRef.current);
      fastPollingRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Load collaborators when component mounts or projectId changes
  useEffect(() => {
    loadCollaborators(true);
  }, [projectId]);

  // Set up polling for collaborator changes
  useEffect(() => {
    if (!projectId) return;

    // OPTIMIZED: Poll every 20 seconds instead of 10 (50% reduction)
    pollingIntervalRef.current = setInterval(() => {
      loadCollaborators(false); // Use cache if available
    }, 20000);

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [projectId, handleVisibilityChange, cleanup]);

  // Monitor users prop changes and trigger refresh if collaborators might have changed
  useEffect(() => {
    // If we detect a new user that's not in our collaborators list, refresh immediately
    const unknownUsers = users.filter(user => !collaborators.some(collab => collab.user_id === user.user_id));
    if (unknownUsers.length > 0 && !loadingCollaborators) {
      console.log('🆕 Detected unknown users, refreshing collaborators:', unknownUsers.map(u => u.user_name));
      loadCollaborators(true);
    }
  }, [users, collaborators, loadingCollaborators]);

  // Periodic deep sync to ensure data consistency
  useEffect(() => {
    if (!projectId) return;

    // OPTIMIZED: Deep sync every 120 seconds instead of 60 (50% reduction)
    const deepSyncInterval = setInterval(() => {
      console.log('🔍 Deep sync: Force refreshing collaborators');
      loadCollaborators(true);
    }, 120000); // Every 120 seconds (was 60s)

    return () => {
      clearInterval(deepSyncInterval);
    };
  }, [projectId, loadCollaborators]);

  return (
    <div className="border-t">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Collaborators</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {users.length} online • {collaborators.length} total
            </span>
            {/* Manual refresh button - always visible for all users */}
            {projectId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManualRefresh}
                disabled={loadingCollaborators}
                className="h-6 w-6 p-0"
                title="Refresh collaborators list"
              >
                <RefreshCw className={`w-3 h-3 ${loadingCollaborators ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {/* Sync workspace button - only for non-owners */}
            {projectId && !isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSyncWorkspace}
                disabled={syncingWorkspace}
                className="h-6 w-6 p-0"
                title="Sync workspace with latest changes"
              >
                <RefreshCw className={`w-3 h-3 text-blue-500 ${syncingWorkspace ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="max-h-64">
        <div className="p-2 space-y-2">
          {/* Active Users (Real-time presence) */}
          {users
            .filter((user) => {
              // Only show users who are actual collaborators
              return collaborators.some(collab => collab.user_id === user.user_id);
            })
            .map((user) => {
            // Find the user's role from collaborators list
            const userRole = collaborators.find(collab => collab.user_id === user.user_id)?.role || 'viewer';
            const isCurrentUserSelf = session?.user?.id === user.user_id;
            
            return (
              <div key={`active-${user.user_id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                <div className="relative">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback 
                      className="text-xs"
                      style={{ backgroundColor: getRandomColor(user.user_id), color: 'white' }}
                    >
                      {user.user_avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{user.user_name}</span>
                    {userRole === 'owner' && (
                      <Crown className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatLastSeen(user.last_seen)}</span>
                    {user.file && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <code className="text-xs text-muted-foreground">{user.file.split('/').pop()}</code>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Code className="w-3 h-3 text-blue-500" />
                  
                  <RoleSelector
                    currentRole={userRole}
                    userId={user.user_id}
                    userName={user.user_name}
                    onRoleChange={handleRoleChange}
                    isOwner={isOwner}
                    isCurrentUser={isCurrentUserSelf}
                  />
                  
                  {isOwner && userRole !== 'owner' && !isCurrentUserSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => handleRemoveCollaborator(user.user_id, user.user_name)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove from project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {/* Project Collaborators (not currently active) */}
          {collaborators
            .filter(collab => !users.some(user => user.user_id === collab.user_id))
            .map((collaborator) => (
            <div key={`collab-${collaborator.user_id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent opacity-75">
              <div className="relative">
                <Avatar className="w-8 h-8">
                  <AvatarFallback 
                    className="text-xs"
                    style={{ backgroundColor: getRandomColor(collaborator.user_id), color: 'white' }}
                  >
                    {collaborator.user_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-400 border-2 border-background rounded-full" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{collaborator.user_name || 'Unknown User'}</span>
                  {collaborator.role === 'owner' && (
                    <Crown className="w-3 h-3 text-yellow-500" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Offline</div>
              </div>

              <div className="flex items-center gap-2">
                <RoleSelector
                  currentRole={collaborator.role}
                  userId={collaborator.user_id}
                  userName={collaborator.user_name}
                  onRoleChange={handleRoleChange}
                  isOwner={isOwner}
                  isCurrentUser={session?.user?.id === collaborator.user_id}
                />
                
                {isOwner && collaborator.role !== 'owner' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => handleRemoveCollaborator(collaborator.user_id, collaborator.user_name)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove from project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}

          {loadingCollaborators && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Loading collaborators...
            </div>
          )}

          {users.length === 0 && !loadingCollaborators && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No one is currently online
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-3 space-y-2">
        {(project || (projectId && projectName)) ? (
          <div className="space-y-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsShareModalOpen(true)}
              className="w-full"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Invite Collabrators 
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <JoinCollaboration onProjectJoined={handleProjectJoined} />
            <div className="text-xs text-muted-foreground text-center">
              Select a project to share
            </div>
          </div>
        )}
      </div>

      {(project || (projectId && projectName)) && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onInviteSent={() => {
            // When invitations are sent, start fast polling to catch new collaborators immediately
            console.log('📨 Invitations sent, starting fast polling');
            startFastPolling();
            loadCollaborators(true);
          }}
          project={project || { 
            id: projectId!, 
            name: projectName!,
            owner_id: '',
            created_at: '',
            updated_at: '',
            collaborators: []
          }}
        />
      )}
    </div>
  );
}
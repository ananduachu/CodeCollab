import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Send, Paperclip, Smile, Code, Bot, Sparkles } from 'lucide-react';
import { Project } from '../hooks/useProject';
import { UserPresence } from '../hooks/usePresence';
import { useChat } from '../hooks/useChat';
import { useAuth } from './AuthWrapper';
import { AIModal } from './AIModal';
import { aiService } from '../services/aiService';
import { CodeBlock } from './ui/code-block';

interface ChatPanelProps {
  project: Project;
  activeUsers: UserPresence[];
}

export function ChatPanel({ project, activeUsers }: ChatPanelProps) {
  const { user } = useAuth();
  const { messages, sendMessage } = useChat(project.id);
  const [newMessage, setNewMessage] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (newMessage.trim()) {
      try {
        // Check if this is an AI query
        const aiQuery = aiService.parseAIQuery(newMessage);
        
        if (aiQuery) {
          setIsAIProcessing(true);
          
          // Send the user's query first
          await sendMessage(newMessage, 'text');
          
          try {
            // Get AI response
            const aiResponse = await aiService.queryAI(aiQuery.modelId, aiQuery.query);
            
            // Send AI response as a separate message
            await sendMessage(
              `🤖 **${aiResponse.model}**: ${aiResponse.content}`,
              'text'
            );
          } catch (aiError) {
            console.error('AI query failed:', aiError);
            await sendMessage(
              `🤖 **AI Error**: Failed to get response from ${aiQuery.modelId}. ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
              'text'
            );
          } finally {
            setIsAIProcessing(false);
          }
        } else {
          // Regular message
          await sendMessage(newMessage, 'text');
        }
        
        setNewMessage('');
      } catch (error) {
        console.error('Failed to send message:', error);
        setIsAIProcessing(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getRandomColor = (userId: string) => {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  // Parse AI response content to extract code blocks and regular text
  const parseAIResponse = (content: string) => {
    const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    
    // Extract AI model prefix if present
    const modelMatch = content.match(/🤖 \*\*(.*?)\*\*:\s*/);
    const modelPrefix = modelMatch ? `🤖 **${modelMatch[1]}**: ` : '';
    const cleanContent = content.replace(/🤖 \*\*(.*?)\*\*:\s*/, '');
    
    // Split by code blocks
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let isFirstPart = true;
    
    while ((match = codeBlockRegex.exec(cleanContent)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        let textContent = cleanContent.slice(lastIndex, match.index).trim();
        if (textContent) {
          // Add model prefix to the first text part
          if (isFirstPart && modelPrefix) {
            textContent = modelPrefix + textContent;
            isFirstPart = false;
          }
          parts.push({ type: 'text', content: textContent });
        }
      }
      
      // Add code block
      const language = match[1] || undefined;
      const code = match[2].trim();
      parts.push({ type: 'code', content: code, language });
      
      lastIndex = match.index + match[0].length;
      isFirstPart = false;
    }
    
    // Add remaining text after last code block
    if (lastIndex < cleanContent.length) {
      let textContent = cleanContent.slice(lastIndex).trim();
      if (textContent) {
        // Add model prefix if this is the only text part
        if (isFirstPart && modelPrefix) {
          textContent = modelPrefix + textContent;
        }
        parts.push({ type: 'text', content: textContent });
      }
    }
    
    // If no code blocks found, return the entire content as text
    if (parts.length === 0) {
      parts.push({ type: 'text', content: content });
    }
    
    return parts;
  };

  // Format text content with basic markdown-like formatting
  const formatTextContent = (content: string) => {
    return content
      .replace(/🤖 \*\*(.*?)\*\*:/, '<strong>🤖 $1:</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-black/10 px-1 rounded">$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="h-full flex flex-col border-l">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Team Chat</h3>
          <div className="flex items-center gap-2">
            <AIModal />
            <Badge variant="secondary" className="text-xs">
              {activeUsers.length} online
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-3">
            {messages.map((message) => {
            const isCurrentUser = message.user_id === user?.id;
            const userColor = getRandomColor(message.user_id);
            const userInitials = message.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const isAIResponse = message.content.startsWith('🤖');
            const isAIQuery = aiService.parseAIQuery(message.content) !== null;
            
            // AI responses should always be left-aligned, regardless of who sent them
            const shouldRightAlign = isCurrentUser && !isAIResponse;
            
            return (
              <div key={message.id} className={`flex gap-3 ${shouldRightAlign ? 'flex-row-reverse' : ''}`}>
                <Avatar className="w-6 h-6">
                  <AvatarFallback 
                    className="text-xs"
                    style={{ 
                      backgroundColor: isAIResponse ? '#10b981' : userColor, 
                      color: 'white' 
                    }}
                  >
                    {isAIResponse ? '🤖' : userInitials}
                  </AvatarFallback>
                </Avatar>
                
                <div className={`flex-1 ${shouldRightAlign ? 'text-right' : ''}`}>
                  <div className={`flex items-center gap-2 mb-1 ${shouldRightAlign ? 'justify-end' : ''}`}>
                    <span className="text-xs font-medium">
                      {isAIResponse ? 'AI Assistant' : message.user_name}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
                    {isAIQuery && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI Query
                      </Badge>
                    )}
                  </div>
                  
                  <div className={`inline-block max-w-lg rounded-lg p-2 ${
                    isAIResponse
                      ? 'bg-green-100 dark:bg-green-900 border-l-4 border-green-500'
                      : shouldRightAlign 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                  }`}>
                    {message.type === 'code' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-xs opacity-75">
                          <Code className="w-3 h-3" />
                          Code snippet
                        </div>
                        <pre className="text-xs bg-black/10 rounded p-2 overflow-x-auto">
                          <code>{message.content}</code>
                        </pre>
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">
                        {isAIResponse ? (
                          <div className="space-y-3">
                            {parseAIResponse(message.content).map((part, index) => (
                              <div key={index}>
                                {part.type === 'code' ? (
                                  <CodeBlock 
                                    code={part.content} 
                                    language={part.language}
                                    className="rounded border"
                                  />
                                ) : (
                                  <div 
                                    dangerouslySetInnerHTML={{
                                      __html: formatTextContent(part.content)
                                    }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          message.content
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        </ScrollArea>
      </div>

      <div className="p-3 border-t">
        {/* AI Query Helper */}
        {newMessage.startsWith('?') && (
          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs">
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 mb-1">
              <Bot className="w-3 h-3" />
              AI Query Mode
            </div>
            <p className="text-blue-600 dark:text-blue-400">
              Format: <code>?model query</code> • Available: gpt-mini, gpt-4, gpt-4o
            </p>
            {aiService.parseAIQuery(newMessage) && (
              <p className="text-green-600 dark:text-green-400 mt-1">
                ✓ Valid AI query detected
              </p>
            )}
          </div>
        )}
        
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message... (use ?model query for AI)"
              className="pr-20"
              disabled={isAIProcessing}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Paperclip className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Code className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Smile className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <Button 
            onClick={handleSendMessage} 
            size="sm"
            disabled={isAIProcessing}
          >
            {isAIProcessing ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
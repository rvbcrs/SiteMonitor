import React, { useState, useEffect, useRef } from 'react';
import { Clock, Globe, Plus, Trash2, AlertCircle, LogOut, X, ChevronDown, ChevronUp, Bell, Settings, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { authApi } from './lib/auth';
import { NotificationSettings } from './components/NotificationSettings';
import { supabase } from './lib/supabase';
import { startMonitoringService, stopMonitoringService, forceCheckAllMonitors, forceCheckMonitor, debugLog } from './lib/monitor';

interface Monitor {
  id: string;
  url: string;
  selector: string;
  interval: number;
  last_checked?: string;
  last_value?: string;
}

interface GroupedMonitors {
  [url: string]: {
    monitors: Monitor[];
    isExpanded: boolean;
  };
}

function App() {
  const [url, setUrl] = useState('');
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [groupedMonitors, setGroupedMonitors] = useState<GroupedMonitors>({});
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [selectedSelectors, setSelectedSelectors] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [refreshingMonitor, setRefreshingMonitor] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const monitoringServiceStarted = useRef(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    authApi.getSession().then(session => {
      setSession(session);
    });

    const unsubscribe = authApi.onAuthStateChange((session) => {
      setSession(session);
    });

    return () => unsubscribe();
  }, []);

  // Start monitoring service when the session is available
  useEffect(() => {
    if (session && !monitoringServiceStarted.current) {
      debugLog('Starting monitoring service from App component', null, true);
      monitoringServiceStarted.current = true;
      startMonitoringService(30); // Check every 30 seconds
    } else if (!session && monitoringServiceStarted.current) {
      debugLog('Stopping monitoring service due to no session', null, true);
      monitoringServiceStarted.current = false;
      stopMonitoringService();
    }

    return () => {
      if (monitoringServiceStarted.current) {
        debugLog('Stopping monitoring service on component unmount', null, true);
        stopMonitoringService();
        monitoringServiceStarted.current = false;
      }
    };
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchMonitors();
    } else {
      setMonitors([]);
      setGroupedMonitors({});
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const grouped = monitors.reduce<GroupedMonitors>((acc, monitor) => {
      if (!acc[monitor.url]) {
        acc[monitor.url] = {
          monitors: [],
          isExpanded: true
        };
      }
      acc[monitor.url].monitors.push(monitor);
      return acc;
    }, {});
    setGroupedMonitors(grouped);
  }, [monitors]);

  const fetchMonitors = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    debugLog('Fetching monitors from database', null, true);
    try {
      const data = await authApi.getMonitors();
      debugLog(`Fetched ${data?.length || 0} monitors`, data);
      setMonitors(data || []);
    } catch (error) {
      console.error('Error fetching monitors:', error);
      debugLog(`Error fetching monitors: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to fetch monitors');
    } finally {
      setLoading(false);
    }
  };

  const fetchUrlContent = async (targetUrl: string) => {
    try {
      // Try using our Supabase edge function as a proxy
      try {
        console.log('Attempting to fetch content via Supabase Edge Function...');
        const { data, error } = await supabase.functions.invoke('proxy', {
          body: { url: targetUrl },
          method: 'POST',
        });

        if (error) {
          console.error('Error from proxy function:', error);
          throw new Error(`Failed to fetch content: ${error.message}`);
        }

        if (!data || !data.success) {
          const errorMsg = data?.error || 'Failed to fetch website content';
          console.error('Proxy function returned error:', errorMsg);
          throw new Error(errorMsg);
        }

        return data.content;
      } catch (edgeFunctionError) {
        console.error('Edge function error:', edgeFunctionError);
        
        // Fallback to CORS proxy for development/testing
        console.log('Attempting fallback with CORS proxy...');
        const corsProxies = [
          `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
          `https://cors-anywhere.herokuapp.com/${targetUrl}`,
          `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
        ];
        
        // Try each proxy in order until one works
        for (const proxyUrl of corsProxies) {
          try {
            console.log(`Trying CORS proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
              console.warn(`Proxy ${proxyUrl} failed with status: ${response.status}`);
              continue; // Try next proxy
            }
            
            // Handle different response formats from different proxies
            const responseData = await response.json().catch(() => response.text());
            
            if (typeof responseData === 'object' && responseData.contents) {
              // allorigins format
              return responseData.contents;
            } else if (typeof responseData === 'string') {
              // Direct content
              return responseData;
            } else {
              console.warn('Unexpected proxy response format:', responseData);
              continue; // Try next proxy
            }
          } catch (proxyError) {
            console.warn(`Error with proxy ${proxyUrl}:`, proxyError);
            // Continue to the next proxy
          }
        }
        
        // If we've exhausted all proxies, throw the original error
        throw new Error('All available methods to fetch content failed. Please check the URL or try again later.');
      }
    } catch (error) {
      console.error('Error fetching content:', error);
      throw error;
    }
  };

  const handleAddMonitor = async () => {
    if (!url || url.trim() === '') {
      toast.error('Please enter a URL');
      return;
    }
    
    let targetUrl = url;
    
    try {
      setIsLoadingPreview(true);
      
      // Validate URL format before proceeding
      try {
        // Make sure it's a valid URL string before creating a URL object
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = 'https://' + targetUrl;
          setUrl(targetUrl);
        }
        new URL(targetUrl);
      } catch (error) {
        toast.error('Please enter a valid URL');
        setIsLoadingPreview(false);
        return;
      }

      const content = await fetchUrlContent(targetUrl);
      setPreviewHtml(content);
      setShowPreview(true);
      setIsLoadingPreview(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load preview');
      setIsLoadingPreview(false);
    }
  };

  const handleSaveMonitors = async () => {
    if (selectedSelectors.length === 0) {
      toast.error('Please select at least one element to monitor');
      return;
    }

    if (!session) {
      toast.error('Please sign in to add monitors');
      return;
    }

    try {
      debugLog(`Adding ${selectedSelectors.length} new monitors`, selectedSelectors, true);
      const newMonitors = await authApi.addMonitors(
        selectedSelectors.map(selector => ({
          url,
          selector,
          interval: 60
        }))
      );
      
      debugLog(`Successfully added ${newMonitors?.length || 0} monitors`, newMonitors);
      setMonitors([...(newMonitors || []), ...monitors]);
      setUrl('');
      setShowPreview(false);
      setSelectedSelectors([]);
      setPreviewHtml('');
      toast.success('Monitors added successfully');
    } catch (error) {
      debugLog(`Error adding monitors: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to add monitors');
      console.error('Error:', error);
    }
  };

  const handleDeleteMonitor = async (id: string) => {
    if (!session) return;

    try {
      debugLog(`Deleting monitor ${id}`, null, true);
      await authApi.deleteMonitor(id);
      setMonitors(monitors.filter(m => m.id !== id));
      toast.success('Monitor deleted successfully');
    } catch (error) {
      debugLog(`Error deleting monitor ${id}: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to delete monitor');
      console.error('Error:', error);
    }
  };

  const handleIntervalChange = async (id: string, interval: number) => {
    if (!session) return;

    try {
      debugLog(`Updating monitor ${id} interval to ${interval} minutes`, null, true);
      await authApi.updateMonitorInterval(id, interval);
      setMonitors(monitors.map(m => 
        m.id === id ? { ...m, interval } : m
      ));
      toast.success('Interval updated successfully');
    } catch (error) {
      debugLog(`Error updating monitor ${id} interval: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to update interval');
      console.error('Error:', error);
    }
  };

  const handleSignOut = async () => {
    await authApi.signOut();
    setMonitors([]);
  };

  const handleRemoveSelector = (selectorToRemove: string) => {
    setSelectedSelectors(prev => prev.filter(selector => selector !== selectorToRemove));
    
    iframeRef.current?.contentWindow?.postMessage({
      type: 'removeSelector',
      selector: selectorToRemove
    }, '*');
  };

  const handleIframeMessage = (event: MessageEvent) => {
    if (event.data.type === 'elementSelected') {
      const selector = event.data.selector;
      setSelectedSelectors(prev => {
        const index = prev.indexOf(selector);
        if (index === -1) {
          return [...prev, selector];
        } else {
          return prev.filter(s => s !== selector);
        }
      });
    }
  };

  const toggleUrlExpansion = (url: string) => {
    setGroupedMonitors(prev => ({
      ...prev,
      [url]: {
        ...prev[url],
        isExpanded: !prev[url].isExpanded
      }
    }));
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      
      if (permission === 'granted') {
        toast.success('Browser notifications enabled');
      } else {
        toast.error('Browser notifications denied');
      }
    }
  };

  // Force check a specific monitor
  const handleRefreshMonitor = async (id: string) => {
    if (!session) return;
    
    try {
      setRefreshingMonitor(id);
      debugLog(`Manually refreshing monitor ${id}`, null, true);
      
      toast.loading('Checking monitor...', { id: 'monitor-refresh' });
      const changed = await forceCheckMonitor(id);
      toast.dismiss('monitor-refresh');
      
      if (changed) {
        toast.success('Changes detected!');
      } else {
        toast.success('Monitor checked. No changes detected.');
      }
      
      // Refresh the monitor list to get the updated last_checked and last_value
      await fetchMonitors();
    } catch (error) {
      debugLog(`Error refreshing monitor ${id}: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to check monitor');
      console.error('Error refreshing monitor:', error);
    } finally {
      setRefreshingMonitor(null);
    }
  };

  // Force check all monitors
  const handleRefreshAllMonitors = async () => {
    if (!session) return;
    
    try {
      setIsCheckingAll(true);
      debugLog('Manually refreshing all monitors', null, true);
      
      toast.loading('Checking all monitors...', { id: 'all-monitors-refresh' });
      await forceCheckAllMonitors();
      toast.dismiss('all-monitors-refresh');
      toast.success('All monitors checked');
      
      // Refresh the monitor list to get the updated data
      await fetchMonitors();
    } catch (error) {
      debugLog(`Error refreshing all monitors: ${error instanceof Error ? error.message : String(error)}`, error, true);
      toast.error('Failed to check monitors');
      console.error('Error refreshing all monitors:', error);
    } finally {
      setIsCheckingAll(false);
    }
  };

  // Helper function to format interval display
  const formatIntervalDisplay = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    } else if (minutes < 1440) {
      const hours = minutes / 60;
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    } else if (minutes < 10080) {
      const days = minutes / 1440;
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    } else {
      const weeks = minutes / 10080;
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
    }
  };

  useEffect(() => {
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []);

  return (
    <div className="min-h-screen bg-supabase-dark">
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#2E2E2E',
            color: '#F8F9FA',
            border: '1px solid #FF7A00'
          },
          success: {
            iconTheme: {
              primary: '#FF7A00',
              secondary: '#1C1C1C',
            },
          },
          error: {
            iconTheme: {
              primary: '#FF4B4B',
              secondary: '#1C1C1C',
            },
          },
        }}
      />
      
      {!session ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full p-8 bg-supabase-darkAccent rounded-lg shadow-xl border border-gray-800">
            <div className="flex items-center justify-center mb-8">
              <Globe className="h-8 w-8 text-supabase-green" />
              <h1 className="ml-3 text-2xl font-bold text-supabase-light">Website Monitor</h1>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
            }}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-supabase-gray">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-700 bg-supabase-darker text-supabase-light shadow-sm"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-supabase-gray">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-700 bg-supabase-darker text-supabase-light shadow-sm"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => authApi.login(email, password)}
                    className="flex-1 bg-supabase-darkAccent border border-supabase-green text-supabase-green rounded-md py-2 hover:bg-supabase-green hover:text-supabase-darker transition-colors"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => authApi.signup(email, password)}
                    className="flex-1 bg-supabase-green text-supabase-darker rounded-md py-2 hover:bg-supabase-lightGreen transition-colors"
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-4 sm:px-6 lg:px-8 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto">
              <div className="backdrop-blur-md bg-supabase-darker/70 shadow-lg border border-gray-700/50 rounded-xl px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Globe className="h-8 w-8 text-supabase-green" />
                    <h1 className="ml-3 text-2xl font-bold text-supabase-light">Website Monitor</h1>
                  </div>
                  <div className="flex items-center gap-4">
                    {!notificationsEnabled && (
                      <button
                        onClick={requestNotificationPermission}
                        className="flex items-center gap-2 text-sm text-supabase-gray hover:text-supabase-light"
                      >
                        <Bell className="h-5 w-5" />
                        Enable Browser Notifications
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                      className="flex items-center gap-2 text-sm text-supabase-gray hover:text-supabase-light"
                    >
                      <Settings className="h-5 w-5" />
                      Notification Settings
                    </button>
                    <span className="text-sm text-supabase-gray">{session.user?.email}</span>
                    <button
                      onClick={handleSignOut}
                      className="text-supabase-gray hover:text-supabase-light"
                    >
                      <LogOut className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <main className="max-w-7xl mx-auto px-4 pt-2 pb-6 sm:px-6 lg:px-8">
            {showNotificationSettings ? (
              <div className="bg-supabase-darkAccent rounded-lg shadow-lg border border-gray-800 p-6 mb-6">
                <NotificationSettings userId={session.user.id} />
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowNotificationSettings(false)}
                    className="px-4 py-2 text-sm font-medium text-supabase-green border border-supabase-green rounded-md hover:bg-supabase-green hover:text-supabase-darker transition-colors"
                  >
                    Back to Monitors
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-supabase-darkAccent rounded-lg shadow-lg border border-gray-800 p-6 mb-4">
                  <div className="flex gap-4">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Enter website URL to monitor"
                      className="flex-1 px-4 py-2 border border-gray-700 bg-supabase-darker text-supabase-light rounded-md"
                    />
                    <button
                      onClick={handleAddMonitor}
                      disabled={!url || isLoadingPreview}
                      className="px-4 py-2 bg-supabase-green text-supabase-light rounded-md hover:bg-supabase-lightGreen disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {isLoadingPreview ? (
                        <>
                          <div className="h-5 w-5 border-t-2 border-supabase-light rounded-full animate-spin"></div>
                          Loading...
                        </>
                      ) : (
                        <>
                          <Plus className="h-5 w-5" />
                          Load Preview
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {showPreview && (
                  <div className="bg-supabase-darkAccent rounded-lg shadow-lg border border-gray-800 p-6 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-400" />
                        <p className="text-sm text-supabase-gray">
                          Click on elements to select/deselect them for monitoring
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowPreview(false);
                          setSelectedSelectors([]);
                          setPreviewHtml('');
                        }}
                        className="text-supabase-gray hover:text-supabase-light"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="border border-gray-700 rounded-lg bg-supabase-darker mb-4" style={{ height: '600px' }}>
                      <iframe
                        ref={iframeRef}
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <base href="${url}" />
                              <style>
                                .monitor-selected {
                                  background-color: rgba(255, 122, 0, 0.2) !important;
                                  outline: 2px solid rgb(255, 122, 0) !important;
                                }
                                .monitor-hover {
                                  background-color: rgba(255, 122, 0, 0.1) !important;
                                  outline: 2px solid rgb(255, 166, 77) !important;
                                }
                              </style>
                              <script>
                                let currentHighlight = null;
                                let selectedElements = new Map();
                                
                                document.addEventListener('mouseover', (e) => {
                                  e.stopPropagation();
                                  if (!selectedElements.has(e.target)) {
                                    e.target.classList.add('monitor-hover');
                                    currentHighlight = e.target;
                                  }
                                });

                                document.addEventListener('mouseout', (e) => {
                                  e.stopPropagation();
                                  if (currentHighlight && !selectedElements.has(e.target)) {
                                    e.target.classList.remove('monitor-hover');
                                    currentHighlight = null;
                                  }
                                });

                                document.addEventListener('click', (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  const element = e.target;
                                  let selector = '';
                                  
                                  if (element.id) {
                                    selector = '#' + element.id;
                                  } else if (element.className) {
                                    selector = '.' + Array.from(element.classList)
                                      .filter(c => !['monitor-selected', 'monitor-hover'].includes(c))
                                      .join('.');
                                  } else {
                                    let path = [];
                                    let current = element;
                                    while (current.parentElement) {
                                      let index = Array.from(current.parentElement.children)
                                        .filter(child => child.tagName === current.tagName)
                                        .indexOf(current) + 1;
                                      path.unshift(\`\${current.tagName.toLowerCase()}:nth-child(\${index})\`);
                                      current = current.parentElement;
                                    }
                                    selector = path.join(' > ');
                                  }

                                  if (selectedElements.has(element)) {
                                    selectedElements.delete(element);
                                    element.classList.remove('monitor-selected');
                                    element.classList.add('monitor-hover');
                                  } else {
                                    selectedElements.set(element, selector);
                                    element.classList.add('monitor-selected');
                                    element.classList.remove('monitor-hover');
                                  }
                                  
                                  window.parent.postMessage({ type: 'elementSelected', selector }, '*');
                                });

                                window.addEventListener('message', (event) => {
                                  if (event.data.type === 'removeSelector') {
                                    const selector = event.data.selector;
                                    const element = document.querySelector(selector);
                                    if (element) {
                                      selectedElements.delete(element);
                                      element.classList.remove('monitor-selected');
                                    }
                                  }
                                });
                              </script>
                            </head>
                            <body>${previewHtml}</body>
                          </html>
                        `}
                        className="w-full h-full"
                        sandbox="allow-same-origin allow-scripts"
                      />
                    </div>
                    {selectedSelectors.length > 0 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-supabase-gray">Selected elements:</p>
                          <ul className="space-y-2">
                            {selectedSelectors.map((selector, index) => (
                              <li key={index} className="flex items-center justify-between bg-supabase-darker px-3 py-2 rounded-md border border-gray-700">
                                <code className="text-sm text-supabase-green">{selector}</code>
                                <button
                                  onClick={() => handleRemoveSelector(selector)}
                                  className="text-supabase-gray hover:text-red-400 transition-colors"
                                  title="Remove element"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveMonitors}
                            className="px-4 py-2 bg-supabase-green text-supabase-light rounded-md hover:bg-supabase-lightGreen flex items-center gap-2 transition-colors"
                          >
                            <Plus className="h-5 w-5" />
                            Add Monitors ({selectedSelectors.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-supabase-darkAccent rounded-lg shadow-lg border border-gray-800">
                  <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="text-lg font-medium text-supabase-light">Active Monitors</h2>
                    <button
                      onClick={handleRefreshAllMonitors}
                      disabled={isCheckingAll}
                      className="px-3 py-1 text-sm bg-supabase-darker text-supabase-light rounded-md hover:bg-gray-700 flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {isCheckingAll ? (
                        <>
                          <div className="h-4 w-4 border-t-2 border-supabase-light rounded-full animate-spin"></div>
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Refresh All
                        </>
                      )}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {loading ? (
                      <div className="px-6 py-8 text-center text-supabase-gray">
                        Loading monitors...
                      </div>
                    ) : Object.keys(groupedMonitors).length === 0 ? (
                      <div className="px-6 py-8 text-center text-supabase-gray">
                        <p>No monitors added yet. Add a website URL above to start monitoring.</p>
                        <p className="mt-2 text-xs">Debug logs are available in the browser console.</p>
                      </div>
                    ) : (
                      Object.entries(groupedMonitors).map(([url, { monitors: urlMonitors, isExpanded }]) => (
                        <div key={url} className="px-6 py-4">
                          <div 
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => toggleUrlExpansion(url)}
                          >
                            <div className="flex items-center gap-2">
                              <Globe className="h-5 w-5 text-supabase-green" />
                              <h3 className="text-sm font-medium text-supabase-light">{url}</h3>
                              <span className="text-xs text-supabase-gray">
                                ({urlMonitors.length} {urlMonitors.length === 1 ? 'monitor' : 'monitors'})
                              </span>
                            </div>
                            <button className="text-supabase-gray hover:text-supabase-light">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </button>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-4 space-y-4">
                              {urlMonitors.map((monitor) => (
                                <div key={monitor.id} className="pl-7 flex items-center justify-between bg-supabase-darker p-3 rounded-md border border-gray-800">
                                  <div>
                                    <p className="text-sm text-supabase-gray">
                                      <code className="bg-gray-800 px-2 py-1 rounded text-supabase-green">{monitor.selector}</code>
                                    </p>
                                    {monitor.last_checked && (
                                      <p className="text-xs text-supabase-muted mt-1">
                                        Last checked: {new Date(monitor.last_checked).toLocaleString()}
                                      </p>
                                    )}
                                    {monitor.last_value && (
                                      <p className="text-xs text-supabase-gray mt-1">
                                        Current value: 
                                        <span className="font-mono bg-gray-800 px-1 rounded text-supabase-light ml-1">
                                          {monitor.last_value.length > 50 
                                            ? `${monitor.last_value.substring(0, 50)}...` 
                                            : monitor.last_value}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRefreshMonitor(monitor.id);
                                      }}
                                      disabled={refreshingMonitor === monitor.id}
                                      className="text-supabase-green hover:text-supabase-lightGreen disabled:opacity-50"
                                      title="Check now"
                                    >
                                      {refreshingMonitor === monitor.id ? (
                                        <div className="h-5 w-5 border-t-2 border-supabase-green rounded-full animate-spin"></div>
                                      ) : (
                                        <RefreshCw className="h-5 w-5" />
                                      )}
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-supabase-gray" />
                                      <select
                                        value={monitor.interval}
                                        onChange={(e) => handleIntervalChange(monitor.id, Number(e.target.value))}
                                        className="text-sm border-gray-700 bg-supabase-darker text-supabase-light rounded-md"
                                      >
                                        <option value={1}>1 minute</option>
                                        <option value={5}>5 minutes</option>
                                        <option value={10}>10 minutes</option>
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={60}>1 hour</option>
                                        <option value={120}>2 hours</option>
                                        <option value={240}>4 hours</option>
                                        <option value={360}>6 hours</option>
                                        <option value={720}>12 hours</option>
                                        <option value={1440}>1 day</option>
                                        <option value={2880}>2 days</option>
                                        <option value={4320}>3 days</option>
                                        <option value={10080}>1 week</option>
                                      </select>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteMonitor(monitor.id);
                                      }}
                                      className="text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="h-5 w-5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-4 bg-gray-800/30 text-xs text-supabase-gray">
                    <p>Debug Mode: ON. Check the browser console for detailed logs about the monitoring process.</p>
                  </div>
                </div>
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
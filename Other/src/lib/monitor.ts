import { supabase } from './supabase';
import { Monitor } from './database.types';
import { sendEmail } from './email';
import toast from 'react-hot-toast';

let monitoringInterval: ReturnType<typeof setInterval> | null = null;
let isCheckingNow = false;
const checkHistory: Record<string, { lastChecked: Date, lastValue: string | null }> = {};

// Debug settings
const DEBUG = true;
const DEBUG_RATE_LIMIT_MS = 10000; // Throttle debug logs
let lastDebugTime = 0;

/**
 * Log function with debug level control
 */
export function debugLog(message: string, data?: any, force = false) {
  if (!DEBUG && !force) return;
  
  const now = Date.now();
  if (!force && now - lastDebugTime < DEBUG_RATE_LIMIT_MS) return;
  lastDebugTime = now;
  
  console.log(`[Monitor Debug] ${message}`, data || '');
}

/**
 * Main function to check a single monitor for changes
 */
export async function checkMonitor(monitor: Monitor): Promise<boolean> {
  const { id, url, selector, last_value } = monitor;
  
  debugLog(`Checking monitor: ${id} for URL: ${url} with selector: ${selector}`, monitor);
  
  try {
    // Try to fetch the content from the URL
    debugLog(`Fetching content from ${url}...`);
    
    // Use the proxy function to fetch the content
    const { data, error } = await supabase.functions.invoke('proxy', {
      body: { url },
      method: 'POST',
    });
    
    if (error) {
      debugLog(`Error fetching content: ${error.message}`, error, true);
      return false;
    }
    
    if (!data || !data.success) {
      debugLog(`Proxy function returned an error: ${data?.error || 'Unknown error'}`, data, true);
      return false;
    }
    
    const html = data.content;
    
    // Create a DOM parser to extract the element using the selector
    debugLog(`Parsing HTML and extracting selector: ${selector}`);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const element = doc.querySelector(selector);
    
    if (!element) {
      debugLog(`Selector not found: ${selector}`, null, true);
      return false;
    }
    
    // Get the text content of the element
    const currentValue = element.textContent?.trim() || '';
    debugLog(`Current value: ${currentValue.substring(0, 100)}${currentValue.length > 100 ? '...' : ''}`);
    debugLog(`Previous value: ${last_value?.substring(0, 100) || 'null'}${last_value && last_value.length > 100 ? '...' : ''}`);
    
    // Update the database with the latest check
    await updateMonitor(id, currentValue);
    
    // Check if the value has changed
    if (last_value !== null && last_value !== currentValue) {
      debugLog(`🔔 CHANGE DETECTED! Value changed for monitor ${id}`, { 
        previous: last_value, 
        current: currentValue 
      }, true);
      
      // Send notification
      await sendNotification(monitor, last_value, currentValue);
      return true;
    } else {
      debugLog(`No change detected for monitor ${id}`);
      return false;
    }
  } catch (error) {
    debugLog(`Error checking monitor ${id}: ${error instanceof Error ? error.message : String(error)}`, error, true);
    console.error('Monitor check error:', error);
    return false;
  }
}

/**
 * Update the monitor in the database with the latest check results
 */
async function updateMonitor(id: string, currentValue: string) {
  debugLog(`Updating monitor ${id} in database with new value and timestamp`);
  
  try {
    const { error } = await supabase
      .from('monitors')
      .update({
        last_checked: new Date().toISOString(),
        last_value: currentValue
      })
      .eq('id', id);
    
    if (error) {
      debugLog(`Error updating monitor in database: ${error.message}`, error, true);
      throw error;
    }
    
    debugLog(`Monitor ${id} updated successfully`);
  } catch (error) {
    console.error('Error updating monitor:', error);
  }
}

/**
 * Send a notification when a change is detected
 */
async function sendNotification(monitor: Monitor, previousValue: string | null, currentValue: string) {
  debugLog(`Preparing to send notification for monitor ${monitor.id}`, { monitor, previousValue, currentValue }, true);
  
  try {
    // Fetch the user's notification preferences
    const { data: user, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user.user) {
      debugLog(`Error getting user: ${userError?.message || 'User not found'}`, userError, true);
      return;
    }
    
    const { data: preferences, error: preferencesError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.user.id)
      .single();
    
    if (preferencesError || !preferences) {
      debugLog(`Error getting notification preferences: ${preferencesError?.message || 'Preferences not found'}`, preferencesError, true);
      return;
    }
    
    // Check if email notifications are enabled
    if (preferences.email_enabled && preferences.email_address) {
      debugLog(`Sending email notification to ${preferences.email_address}`, null, true);
      
      try {
        // Create email content
        const subject = `Website Monitor: Change Detected on ${monitor.url}`;
        const html = `
          <h2>Change Detected on Your Monitored Website</h2>
          <p><strong>URL:</strong> ${monitor.url}</p>
          <p><strong>Element:</strong> ${monitor.selector}</p>
          <p><strong>Previous Value:</strong> ${previousValue || 'N/A'}</p>
          <p><strong>Current Value:</strong> ${currentValue}</p>
          <p><strong>Changed At:</strong> ${new Date().toLocaleString()}</p>
        `;
        
        // Send the email using our email service
        const result = await sendEmail(preferences.email_address, subject, html);
        debugLog(`Email notification sent successfully: ${JSON.stringify(result)}`, null, true);
        
        // Show toast notification
        toast.success('Change detected! Email notification sent.');
      } catch (error) {
        debugLog(`Error sending email notification: ${error instanceof Error ? error.message : String(error)}`, error, true);
        toast.error('Failed to send email notification');
      }
    } else {
      debugLog('Email notifications not enabled or no email address provided', preferences, true);
    }
    
    // Check if browser notifications are enabled
    if (Notification.permission === 'granted') {
      debugLog('Sending browser notification', null, true);
      
      try {
        const notification = new Notification('Website Monitor: Change Detected', {
          body: `Change detected on ${monitor.url}`,
          icon: '/favicon.ico'
        });
        
        notification.onclick = () => {
          window.focus();
        };
      } catch (error) {
        debugLog(`Error sending browser notification: ${error instanceof Error ? error.message : String(error)}`, error, true);
      }
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    debugLog(`Error in sendNotification: ${error instanceof Error ? error.message : String(error)}`, error, true);
  }
}

/**
 * Check all monitors that are due for checking
 */
export async function checkMonitors() {
  if (isCheckingNow) {
    debugLog('Monitor check already in progress, skipping...');
    return;
  }
  
  isCheckingNow = true;
  debugLog('Starting monitor check for all monitors');
  
  try {
    // Get the current user's session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      debugLog('No active session, skipping monitor checks');
      isCheckingNow = false;
      return;
    }
    
    // Fetch all monitors for the current user
    const { data: monitors, error: monitorsError } = await supabase
      .from('monitors')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (monitorsError) {
      debugLog(`Error fetching monitors: ${monitorsError.message}`, monitorsError, true);
      isCheckingNow = false;
      return;
    }
    
    if (!monitors || monitors.length === 0) {
      debugLog('No monitors found');
      isCheckingNow = false;
      return;
    }
    
    debugLog(`Found ${monitors.length} monitors to check`);
    
    // Process each monitor and check if it's time to check it
    for (const monitor of monitors) {
      // Calculate if we should check this monitor based on its interval
      const history = checkHistory[monitor.id];
      const now = new Date();
      
      if (history) {
        const minutesSinceLastCheck = (now.getTime() - history.lastChecked.getTime()) / (1000 * 60);
        const shouldCheck = minutesSinceLastCheck >= monitor.interval;
        
        debugLog(`Monitor ${monitor.id} was last checked ${minutesSinceLastCheck.toFixed(1)} minutes ago, interval is ${monitor.interval} minutes. Should check: ${shouldCheck}`);
        
        if (!shouldCheck) {
          continue;
        }
      }
      
      debugLog(`Checking monitor ${monitor.id} for ${monitor.url}`, monitor);
      
      // Check this monitor
      const changed = await checkMonitor(monitor);
      
      // Update the check history
      checkHistory[monitor.id] = {
        lastChecked: now,
        lastValue: monitor.last_value
      };
      
      debugLog(`Monitor ${monitor.id} check complete. Changed: ${changed}`);
    }
    
    debugLog('All monitor checks completed');
  } catch (error) {
    console.error('Error checking monitors:', error);
    debugLog(`Error in checkMonitors: ${error instanceof Error ? error.message : String(error)}`, error, true);
  } finally {
    isCheckingNow = false;
  }
}

/**
 * Start the monitoring service
 */
export function startMonitoringService(checkIntervalSeconds = 60) {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  
  debugLog(`Starting monitoring service with check interval of ${checkIntervalSeconds} seconds`);
  
  // Run an initial check
  checkMonitors();
  
  // Set up the interval to check periodically
  monitoringInterval = setInterval(() => {
    checkMonitors();
  }, checkIntervalSeconds * 1000);
  
  return () => {
    debugLog('Stopping monitoring service');
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  };
}

/**
 * Stop the monitoring service
 */
export function stopMonitoringService() {
  debugLog('Stopping monitoring service');
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

/**
 * Force a check of all monitors
 */
export function forceCheckAllMonitors() {
  debugLog('Force checking all monitors', null, true);
  checkMonitors();
}

/**
 * Force a check of a specific monitor
 */
export async function forceCheckMonitor(monitorId: string) {
  debugLog(`Force checking monitor ${monitorId}`, null, true);
  
  try {
    const { data: monitor, error } = await supabase
      .from('monitors')
      .select('*')
      .eq('id', monitorId)
      .single();
    
    if (error || !monitor) {
      debugLog(`Error fetching monitor ${monitorId}: ${error?.message || 'Monitor not found'}`, error, true);
      return false;
    }
    
    return await checkMonitor(monitor);
  } catch (error) {
    debugLog(`Error forcing check for monitor ${monitorId}: ${error instanceof Error ? error.message : String(error)}`, error, true);
    return false;
  }
}
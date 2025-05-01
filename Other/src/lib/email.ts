const EMAIL_SERVICE_URL = import.meta.env.VITE_EMAIL_SERVICE_URL || 'http://localhost:3001';
const EMAIL_SERVICE_API_KEY = import.meta.env.VITE_EMAIL_SERVICE_API_KEY || '';

import { debugLog } from './monitor';

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    debugLog(`Sending email to ${to} with subject: ${subject}`, null, true);

    // Check if email service configuration exists
    if (!EMAIL_SERVICE_URL) {
      debugLog("Email service URL not configured", null, true);
      throw new Error('Email service URL not configured. Please add VITE_EMAIL_SERVICE_URL to your .env file.');
    }
    
    if (!EMAIL_SERVICE_API_KEY) {
      debugLog("Email service API key not configured", null, true);
      throw new Error('Email service API key not configured. Please add VITE_EMAIL_SERVICE_API_KEY to your .env file.');
    }
    
    console.log('Sending email via the email service');
    debugLog(`Using email service at ${EMAIL_SERVICE_URL}`, null, true);

    const response = await fetch(`${EMAIL_SERVICE_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': EMAIL_SERVICE_API_KEY
      },
      body: JSON.stringify({ to, subject, content: html })
    });

    debugLog(`Email service response status: ${response.status}`, null, true);

    if (!response.ok) {
      // Try to get a detailed error message from the response
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
        debugLog(`Email service error: ${errorMessage}`, errorData, true);
      } catch {
        errorMessage = `Request failed with status ${response.status}`;
        debugLog(`Email service error: ${errorMessage}`, null, true);
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }

    const data = await response.json();
    debugLog(`Email sent successfully: ${JSON.stringify(data)}`, null, true);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    debugLog(`Error sending email: ${error instanceof Error ? error.message : String(error)}`, error, true);
    throw error;
  }
};

// Fallback: Try to send email via Edge Function if email service fails
export const sendEmailViaEdgeFunction = async (to: string, subject: string, html: string) => {
  try {
    debugLog(`Trying to send email via Edge Function to ${to}`, null, true);

    // Import supabase using dynamic import to avoid circular dependency
    const { supabase } = await import('./supabase');
    
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html },
    });
    
    if (error) {
      debugLog(`Edge Function error: ${error.message}`, error, true);
      throw error;
    }
    
    debugLog(`Email sent via Edge Function: ${JSON.stringify(data)}`, null, true);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error('Error sending email via Edge Function:', error);
    debugLog(`Error sending email via Edge Function: ${error instanceof Error ? error.message : String(error)}`, error, true);
    throw error;
  }
};
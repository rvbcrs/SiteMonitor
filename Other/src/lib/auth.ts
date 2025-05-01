import { auth } from './supabase';

const EMAIL_SERVICE_URL = import.meta.env.VITE_EMAIL_SERVICE_URL || 'http://localhost:3001';
const EMAIL_SERVICE_API_KEY = import.meta.env.VITE_EMAIL_SERVICE_API_KEY || '';

// Extend the auth object with custom functions that use our email service
const extendedAuth = {
  ...auth,
  
  // Override the sendTestNotification method to use our email service
  async sendTestNotification(channel: string, destination: string) {
    try {
      console.log(`Sending test ${channel} notification to ${destination}`);
      
      // Check if email service configuration exists
      if (!EMAIL_SERVICE_URL) {
        throw new Error('Email service URL not configured. Please add VITE_EMAIL_SERVICE_URL to your .env file.');
      }
      
      if (!EMAIL_SERVICE_API_KEY) {
        throw new Error('Email service API key not configured. Please add VITE_EMAIL_SERVICE_API_KEY to your .env file.');
      }
      
      console.log('Using email service for test notification');
      const response = await fetch(`${EMAIL_SERVICE_URL}/api/test-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': EMAIL_SERVICE_API_KEY
        },
        body: JSON.stringify({ channel, destination })
      });

      if (!response.ok) {
        // Try to get a detailed error message from the response
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
        } catch {
          errorMessage = `Request failed with status ${response.status}`;
        }
        
        throw new Error(`Failed to send test notification: ${errorMessage}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error sending test notification:", error);
      throw error;
    }
  }
};

export const authApi = extendedAuth;
import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageCircle, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authApi } from '../lib/auth';
import { EmailServiceStatus } from './EmailServiceStatus';

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  email_address: string | null;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  signal_enabled: boolean;
  signal_number: string | null;
}

interface NotificationSettingsProps {
  userId: string;
}

export function NotificationSettings({ userId }: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [localPreferences, setLocalPreferences] = useState<NotificationPreferences | null>(null);
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  // Check if the email service is configured
  const hasEmailServiceConfig = Boolean(import.meta.env.VITE_EMAIL_SERVICE_URL && import.meta.env.VITE_EMAIL_SERVICE_API_KEY);

  useEffect(() => {
    fetchPreferences();
  }, []);

  useEffect(() => {
    setLocalPreferences(preferences);
  }, [preferences]);

  const fetchPreferences = async () => {
    try {
      const prefs = await authApi.getNotificationPreferences(userId);
      setPreferences(prefs);
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const debouncedUpdate = useCallback((updates: Partial<NotificationPreferences>) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }

    const newTimeout = setTimeout(async () => {
      try {
        await authApi.updateNotificationPreferences(userId, updates);
        setPreferences(prev => prev ? { ...prev, ...updates } : null);
        toast.success('Notification preferences updated');
      } catch (error) {
        console.error('Error updating notification preferences:', error);
        toast.error('Failed to update notification preferences');
        setLocalPreferences(preferences);
      }
    }, 1000);

    setUpdateTimeout(newTimeout);
  }, [userId, preferences, updateTimeout]);

  const updatePreferences = (updates: Partial<NotificationPreferences>) => {
    setLocalPreferences(prev => prev ? { ...prev, ...updates } : null);
    debouncedUpdate(updates);
  };

  const sendTestNotification = async (channel: 'email' | 'whatsapp' | 'signal') => {
    if (!localPreferences) return;

    const channelConfig = {
      email: {
        enabled: localPreferences.email_enabled,
        value: localPreferences.email_address,
        name: 'Email'
      },
      whatsapp: {
        enabled: localPreferences.whatsapp_enabled,
        value: localPreferences.whatsapp_number,
        name: 'WhatsApp'
      },
      signal: {
        enabled: localPreferences.signal_enabled,
        value: localPreferences.signal_number,
        name: 'Signal'
      }
    }[channel];

    if (!channelConfig.enabled) {
      toast.error(`${channelConfig.name} notifications are not enabled`);
      return;
    }

    if (!channelConfig.value) {
      toast.error(`Please enter a valid ${channelConfig.name.toLowerCase()} address`);
      return;
    }
    
    if (channel === 'email' && !hasEmailServiceConfig) {
      toast.error('Email service is not configured. Please set up the email service first.');
      return;
    }

    setTestingChannel(channel);

    try {
      const result = await authApi.sendTestNotification(channel, channelConfig.value);
      toast.success(`Test ${channelConfig.name.toLowerCase()} sent successfully`);
      console.log('Test notification result:', result);
    } catch (error: any) {
      console.error(`Error sending test ${channel} notification:`, error);
      toast.error(error.message || `Failed to send test ${channelConfig.name} notification`);
    } finally {
      setTestingChannel(null);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-supabase-gray">Loading notification settings...</div>;
  }

  const renderTestButton = (channel: 'email' | 'whatsapp' | 'signal') => {
    // Don't show test button for email if email service isn't configured
    if (channel === 'email' && !hasEmailServiceConfig) {
      return (
        <div className="mt-2">
          <span className="text-sm text-orange-400">
            Email service not configured. See documentation below.
          </span>
        </div>
      );
    }
    
    return (
      <button
        type="button"
        onClick={() => sendTestNotification(channel)}
        disabled={testingChannel === channel}
        className="mt-2 flex items-center gap-2 text-sm text-supabase-green hover:text-supabase-lightGreen disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
        {testingChannel === channel ? 'Sending...' : 'Send test notification'}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-supabase-green" />
          <h3 className="text-lg font-medium text-supabase-light">Notification Settings</h3>
        </div>
        <div className="flex items-center gap-4">
          {hasEmailServiceConfig && <EmailServiceStatus />}
        </div>
      </div>

      <div className="space-y-4">
        {/* Email Notifications */}
        <div className="bg-supabase-darker p-4 rounded-lg border border-gray-800">
          <div className="flex items-start gap-4">
            <Mail className="h-5 w-5 text-supabase-gray mt-1" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label className="font-medium text-supabase-light">Email Notifications</label>
                <button
                  type="button"
                  onClick={() => updatePreferences({ email_enabled: !localPreferences?.email_enabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-supabase-green focus:ring-offset-2 focus:ring-offset-supabase-darker ${
                    localPreferences?.email_enabled ? 'bg-supabase-green' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-supabase-darker shadow ring-0 transition duration-200 ease-in-out ${
                      localPreferences?.email_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-2">
                <input
                  type="email"
                  value={localPreferences?.email_address || ''}
                  onChange={(e) => updatePreferences({ email_address: e.target.value })}
                  placeholder="Enter your email address"
                  className="w-full px-3 py-2 border border-gray-700 bg-supabase-dark text-supabase-light rounded-md focus:ring-supabase-green focus:border-supabase-green text-sm"
                />
                {localPreferences?.email_enabled && renderTestButton('email')}
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Notifications */}
        <div className="bg-supabase-darker p-4 rounded-lg border border-gray-800">
          <div className="flex items-start gap-4">
            <MessageCircle className="h-5 w-5 text-supabase-gray mt-1" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label className="font-medium text-supabase-light">WhatsApp Notifications</label>
                <button
                  type="button"
                  onClick={() => updatePreferences({ whatsapp_enabled: !localPreferences?.whatsapp_enabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-supabase-green focus:ring-offset-2 focus:ring-offset-supabase-darker ${
                    localPreferences?.whatsapp_enabled ? 'bg-supabase-green' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-supabase-darker shadow ring-0 transition duration-200 ease-in-out ${
                      localPreferences?.whatsapp_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-2">
                <input
                  type="tel"
                  value={localPreferences?.whatsapp_number || ''}
                  onChange={(e) => updatePreferences({ whatsapp_number: e.target.value })}
                  placeholder="Enter your WhatsApp number"
                  className="w-full px-3 py-2 border border-gray-700 bg-supabase-dark text-supabase-light rounded-md focus:ring-supabase-green focus:border-supabase-green text-sm"
                />
                {localPreferences?.whatsapp_enabled && renderTestButton('whatsapp')}
              </div>
            </div>
          </div>
        </div>

        {/* Signal Notifications */}
        <div className="bg-supabase-darker p-4 rounded-lg border border-gray-800">
          <div className="flex items-start gap-4">
            <MessageCircle className="h-5 w-5 text-supabase-gray mt-1" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label className="font-medium text-supabase-light">Signal Notifications</label>
                <button
                  type="button"
                  onClick={() => updatePreferences({ signal_enabled: !localPreferences?.signal_enabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-supabase-green focus:ring-offset-2 focus:ring-offset-supabase-darker ${
                    localPreferences?.signal_enabled ? 'bg-supabase-green' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-supabase-darker shadow ring-0 transition duration-200 ease-in-out ${
                      localPreferences?.signal_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-2">
                <input
                  type="tel"
                  value={localPreferences?.signal_number || ''}
                  onChange={(e) => updatePreferences({ signal_number: e.target.value })}
                  placeholder="Enter your Signal number"
                  className="w-full px-3 py-2 border border-gray-700 bg-supabase-dark text-supabase-light rounded-md focus:ring-supabase-green focus:border-supabase-green text-sm"
                />
                {localPreferences?.signal_enabled && renderTestButton('signal')}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-900/30">
          <p className="text-sm text-blue-300">
            <strong>Note:</strong> Email notifications are now handled by a standalone Node.js service with Nodemailer
            and Gmail SMTP. See the documentation in <code className="bg-gray-800 px-1 rounded">docs/email-service-setup.md</code> for
            more information on how to set up and configure the email service.
          </p>
          {hasEmailServiceConfig ? (
            <p className="text-sm text-green-400 mt-2">
              <strong>✓ Email Service:</strong> Configuration detected. Make sure the service is running with <code className="bg-gray-800 px-1 rounded">npm run email-service</code>
            </p>
          ) : (
            <p className="text-sm text-orange-400 mt-2">
              <strong>⚠️ Email Service:</strong> Not configured. Add <code className="bg-gray-800 px-1 rounded">VITE_EMAIL_SERVICE_URL</code> and <code className="bg-gray-800 px-1 rounded">VITE_EMAIL_SERVICE_API_KEY</code> to your <code className="bg-gray-800 px-1 rounded">.env</code> file.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
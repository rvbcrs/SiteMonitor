import { z } from 'zod';

const monitorSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  selector: z.string(),
  interval: z.number().int().min(1),
  last_checked: z.string().datetime().nullable(),
  last_value: z.string().nullable(),
  created_at: z.string().datetime(),
  user_id: z.string()
});

const notificationPreferencesSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  email_enabled: z.boolean(),
  email_address: z.string().email().nullable(),
  whatsapp_enabled: z.boolean(),
  whatsapp_number: z.string().nullable(),
  signal_enabled: z.boolean(),
  signal_number: z.string().nullable(),
  created_at: z.string().datetime()
});

export type Monitor = z.infer<typeof monitorSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

const api = {
  async getMonitors(): Promise<Monitor[]> {
    const response = await fetch('/api/monitors');
    if (!response.ok) throw new Error('Failed to fetch monitors');
    return response.json();
  },

  async createMonitor(data: Omit<Monitor, 'id' | 'created_at' | 'last_checked' | 'last_value' | 'user_id'>): Promise<Monitor> {
    const response = await fetch('/api/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create monitor');
    return response.json();
  },

  async updateMonitor(id: string, data: Partial<Monitor>): Promise<Monitor> {
    const response = await fetch(`/api/monitors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update monitor');
    return response.json();
  },

  async deleteMonitor(id: string): Promise<void> {
    const response = await fetch(`/api/monitors/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete monitor');
  },

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const response = await fetch('/api/notification-preferences');
    if (!response.ok) throw new Error('Failed to fetch notification preferences');
    return response.json();
  },

  async updateNotificationPreferences(data: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const response = await fetch('/api/notification-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update notification preferences');
    return response.json();
  }
};

export { api };
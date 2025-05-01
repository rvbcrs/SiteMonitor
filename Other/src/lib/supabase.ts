import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';
import { BrowserEventEmitter } from './events';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

const authEmitter = new BrowserEventEmitter();

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  authEmitter.emit('authStateChange', session);
});

export const auth = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return data.user;
  },

  async signup(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  onAuthStateChange(callback: (session: any) => void) {
    return authEmitter.on('authStateChange', callback);
  },

  async getMonitors() {
    const { data, error } = await supabase
      .from('monitors')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  },

  async addMonitors(monitors: Array<{ url: string; selector: string; interval: number }>) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const monitorsWithUser = monitors.map(monitor => ({
      ...monitor,
      user_id: user.user.id
    }));

    const { data, error } = await supabase
      .from('monitors')
      .insert(monitorsWithUser)
      .select();
      
    if (error) throw error;
    return data;
  },

  async deleteMonitor(id: string) {
    const { error } = await supabase
      .from('monitors')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
  },

  async updateMonitorInterval(id: string, interval: number) {
    const { error } = await supabase
      .from('monitors')
      .update({ interval })
      .eq('id', id);
      
    if (error) throw error;
  },

  async getNotificationPreferences(userId: string) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error;
    return data || {
      id: '',
      user_id: userId,
      email_enabled: false,
      email_address: null,
      whatsapp_enabled: false,
      whatsapp_number: null,
      signal_enabled: false,
      signal_number: null,
      created_at: new Date().toISOString()
    };
  },

  async updateNotificationPreferences(userId: string, updates: any) {
    // First check if preferences exist for this user
    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update existing preferences
      const { data, error } = await supabase
        .from('notification_preferences')
        .update(updates)
        .eq('user_id', userId)
        .select();
        
      if (error) throw error;
      return data[0];
    } else {
      // Create new preferences
      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({
          user_id: userId,
          ...updates
        })
        .select();
        
      if (error) throw error;
      return data[0];
    }
  },

  async sendTestNotification(channel: string, destination: string) {
    try {
      console.log(`Sending test ${channel} notification to ${destination}`);
      
      // Call the Edge Function for sending test notifications
      const { data, error } = await supabase.functions.invoke('test-notification', {
        body: { channel, destination }
      });
      
      if (error) {
        console.error("Error from test-notification function:", error);
        throw new Error(`Failed to send test notification: ${error.message || 'Unknown error'}`);
      }
      
      if (!data.success) {
        console.error("Test notification failed:", data.message);
        throw new Error(`Failed to send test notification: ${data.message}`);
      }
      
      console.log("Test notification response:", data);
      return data;
    } catch (error) {
      console.error("Error invoking test-notification function:", error);
      throw error;
    }
  }
};
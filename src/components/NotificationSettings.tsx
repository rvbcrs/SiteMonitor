import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
} from '@mui/material';
import { NotificationSettings } from '../types';
import axios from 'axios';

const NotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    email: '',
    frequency: 'immediate',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings/notifications');
      setSettings(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch notification settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post('/api/settings/notifications', settings);
      setSuccess(true);
      setError(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save notification settings');
      console.error(err);
    }
  };

  const handleChange = (field: keyof NotificationSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Notification Settings
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully!</Alert>}

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography sx={{ flex: 1 }}>Enable Notifications</Typography>
        <Switch
          checked={settings.enabled}
          onChange={(e) => handleChange('enabled', e.target.checked)}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Email Address"
          value={settings.email}
          onChange={(e) => handleChange('email', e.target.value)}
          disabled={!settings.enabled}
          sx={{ mb: 2 }}
        />

        <FormControl fullWidth disabled={!settings.enabled}>
          <InputLabel>Notification Frequency</InputLabel>
          <Select
            value={settings.frequency}
            label="Notification Frequency"
            onChange={(e) => handleChange('frequency', e.target.value)}
          >
            <MenuItem value="immediate">Immediate</MenuItem>
            <MenuItem value="daily">Daily Summary</MenuItem>
            <MenuItem value="weekly">Weekly Summary</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Button
        variant="contained"
        onClick={handleSave}
        disabled={!settings.enabled && !settings.email}
      >
        Save Settings
      </Button>
    </Paper>
  );
};

export default NotificationSettings; 
import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Grid,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Snackbar,
  Alert,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon, Mail as MailIcon } from '@mui/icons-material';
import axios from 'axios';
import { useNotification } from '../contexts/NotificationContext';

const INTERVALS = [
  { label: '24 uur', value: '0 0 * * *' },
  { label: '8 uur', value: '0 */8 * * *' },
  { label: '1 uur', value: '0 * * * *' },
  { label: '30 minuten', value: '*/30 * * * *' },
  { label: '15 minuten', value: '*/15 * * * *' },
  { label: '10 minuten', value: '*/10 * * * *' },
  { label: '5 minuten', value: '*/5 * * * *' },
];

interface SettingsState {
  loginUrl: string;
  targetUrl: string;
  schedule: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  username: string;
  password: string;
  emailEnabled: boolean;
  toEmail: string;
}

const defaultState: SettingsState = {
  loginUrl: '',
  targetUrl: '',
  schedule: '*/10 * * * *',
  usernameSelector: '',
  passwordSelector: '',
  submitSelector: '',
  username: '',
  password: '',
  emailEnabled: false,
  toEmail: '',
};

const Settings: React.FC = () => {
  const { showNotification } = useNotification();
  const [form, setForm] = useState<SettingsState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/config');
      const { website = {}, schedule = defaultState.schedule } = res.data;
      setForm({
        loginUrl: website.loginUrl || '',
        targetUrl: website.targetUrl || '',
        schedule,
        usernameSelector: website.usernameSelector || '',
        passwordSelector: website.passwordSelector || '',
        submitSelector: website.submitSelector || '',
        username: website.username || '',
        password: website.password || '',
        emailEnabled: website.emailEnabled ?? false,
        toEmail: website.toEmail || '',
      });
    } catch (err) {
      console.error('Error loading config', err);
      showNotification('Fout bij laden configuratie', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (field: keyof SettingsState, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.post('/api/config', {
        website: {
          loginUrl: form.loginUrl,
          targetUrl: form.targetUrl,
          usernameSelector: form.usernameSelector,
          passwordSelector: form.passwordSelector,
          submitSelector: form.submitSelector,
          username: form.username,
          password: form.password,
          emailEnabled: form.emailEnabled,
          toEmail: form.toEmail,
        },
        schedule: form.schedule,
      });
      showNotification('Instellingen opgeslagen', 'success');
      setSuccess(true);
    } catch (err) {
      console.error('Save failed', err);
      showNotification('Opslaan mislukt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    try {
      await axios.post('/api/test-email', { to: form.toEmail }, {
        headers: { 'x-api-key': process.env.REACT_APP_EMAIL_API_KEY || '' },
      });
      showNotification('Test e-mail verzonden', 'success');
    } catch (err) {
      console.error('Test email failed', err);
      showNotification('Test e-mail mislukt', 'error');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Settings</Typography>
      <Grid container spacing={2}>
        {/* URLs */}
        <Grid item xs={12} md={6}>
          <TextField label="Login URL" fullWidth value={form.loginUrl} onChange={e => update('loginUrl', e.target.value)} required />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField label="Target URL" fullWidth value={form.targetUrl} onChange={e => update('targetUrl', e.target.value)} required />
        </Grid>

        {/* Cron interval */}
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Check Interval</InputLabel>
            <Select value={form.schedule} label="Check Interval" onChange={e => update('schedule', e.target.value)}>
              {INTERVALS.map(i => <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>

        {/* Selectors */}
        <Grid item xs={12} md={4}>
          <TextField label="Username Selector" fullWidth value={form.usernameSelector} onChange={e=>update('usernameSelector',e.target.value)} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField label="Password Selector" fullWidth value={form.passwordSelector} onChange={e=>update('passwordSelector',e.target.value)} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField label="Submit Selector" fullWidth value={form.submitSelector} onChange={e=>update('submitSelector',e.target.value)} />
        </Grid>

        {/* Credentials */}
        <Grid item xs={12} md={6}>
          <TextField label="Username" fullWidth value={form.username} onChange={e=>update('username',e.target.value)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField label="Password" type="password" fullWidth value={form.password} onChange={e=>update('password',e.target.value)} />
        </Grid>

        {/* Email */}
        <Grid item xs={12} md={6}>
          <FormControlLabel control={<Switch checked={form.emailEnabled} onChange={e=>update('emailEnabled',e.target.checked)} />} label="Enable Email Notifications" />
        </Grid>
        {form.emailEnabled && (
          <Grid item xs={12} md={6}>
            <TextField label="To Email" fullWidth value={form.toEmail} onChange={e=>update('toEmail',e.target.value)} />
          </Grid>
        )}
      </Grid>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadConfig} disabled={saving}>Reload</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>Save</Button>
        {form.emailEnabled && <Button variant="contained" color="secondary" startIcon={<MailIcon />} onClick={sendTestEmail}>Send Test Email</Button>}
      </Stack>

      <Snackbar open={success} autoHideDuration={3000} onClose={()=>setSuccess(false)}>
        <Alert severity="success" onClose={()=>setSuccess(false)}>Saved!</Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings; 
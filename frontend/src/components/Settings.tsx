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
  Chip,
  List,
  ListItem,
  ListItemText,
  IconButton,
  ListItemSecondaryAction,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon, Mail as MailIcon } from '@mui/icons-material';
import axios from 'axios';
import { useNotification } from '../contexts/NotificationContext';
import { useThemeContext } from '../contexts/ThemeContext';
import DeleteIcon from '@mui/icons-material/Delete';

const INTERVALS = [
  { label: '24 uur', value: '0 0 * * *' },
  { label: '8 uur', value: '0 */8 * * *' },
  { label: '1 uur', value: '0 * * * *' },
  { label: '30 minuten', value: '*/30 * * * *' },
  { label: '15 minuten', value: '*/15 * * * *' },
  { label: '10 minuten', value: '*/10 * * * *' },
  { label: '5 minuten', value: '*/5 * * * *' },
];

interface SiteConfig {
  targetUrl: string;
  isActive: boolean;
  name?: string;
  contentSelector?: string;
}

interface SettingsState {
  loginUrl: string;
  newTargetUrl: string;
  websites: SiteConfig[];
  schedule: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  username: string;
  password: string;
  emailEnabled: boolean;
  emailService: string;
  emailUser: string;
  emailPass: string;
  emailFrom: string;
  emailTo: string;
  emailSubject: string;
  emailApiKey: string;
  theme: string;
}

const defaultState: SettingsState = {
  loginUrl: '',
  newTargetUrl: '',
  websites: [],
  schedule: '*/10 * * * *',
  usernameSelector: '',
  passwordSelector: '',
  submitSelector: '',
  username: '',
  password: '',
  emailEnabled: false,
  emailService: 'gmail',
  emailUser: '',
  emailPass: '',
  emailFrom: '',
  emailTo: '',
  emailSubject: 'SiteMonitor Notification',
  emailApiKey: '',
  theme: 'light',
};

const Settings: React.FC = () => {
  const { showNotification } = useNotification();
  const { themeName, setTheme } = useThemeContext();
  const [form, setForm] = useState<SettingsState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/config');
      const initialTheme = themeName || defaultState.theme;
      const { website = {}, websites = [], schedule = defaultState.schedule, email = {}, theme = initialTheme } = res.data;
      const loadedForm = {
        loginUrl: website.loginUrl || '',
        newTargetUrl: '',
        websites: websites.length > 0 
          ? websites.map((w:any) => ({ 
              targetUrl: w.targetUrl || '', 
              isActive: w.isActive === undefined ? true : w.isActive,
              name: w.name || '',
              contentSelector: w.contentSelector || ''
            })) 
          : (website.targetUrl ? [{ targetUrl: website.targetUrl, isActive: true, name:'', contentSelector:'' }] : []),
        schedule,
        usernameSelector: website.usernameSelector || '',
        passwordSelector: website.passwordSelector || '',
        submitSelector: website.submitSelector || '',
        username: website.username || '',
        password: website.password || '',
        emailEnabled: email.enabled ?? false,
        emailService: email.service || 'gmail',
        emailUser: email.auth?.user || '',
        emailPass: email.auth?.pass || '',
        emailFrom: email.from || '',
        emailTo: email.to || '',
        emailSubject: email.subject || 'SiteMonitor Notification',
        emailApiKey: email.apiKey || '',
        theme: theme || initialTheme,
      };
      setForm(loadedForm);
      if (theme !== themeName) {
        setTheme(loadedForm.theme);
      }
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
  }, [themeName]);

  const saveTheme = async (newTheme: string) => {
    setSavingTheme(true);
    try {
      await axios.post('/api/config', { theme: newTheme });
      showNotification('Thema opgeslagen', 'success');
      setForm(prev => ({ ...prev, theme: newTheme }));
    } catch (err) {
      console.error('Theme save failed', err);
      showNotification('Opslaan thema mislukt', 'error');
    } finally {
      setSavingTheme(false);
    }
  };

  const update = (field: keyof SettingsState, value: any) => {
    const newForm = { ...form, [field]: value };
    setForm(newForm);
    if (field === 'theme') {
      setTheme(value);
      saveTheme(value);
    }
  };

  const saveOtherSettings = async (updatedWebsites?: SiteConfig[]) => {
    setSaving(true);
    try {
      const payload = {
        website: {
          loginUrl: form.loginUrl,
          usernameSelector: form.usernameSelector,
          passwordSelector: form.passwordSelector,
          submitSelector: form.submitSelector,
          username: form.username,
          password: form.password,
        },
        websites: updatedWebsites || form.websites,
        schedule: form.schedule,
        email: {
          enabled: form.emailEnabled,
          service: form.emailService,
          auth: {
            user: form.emailUser,
            pass: form.emailPass,
          },
          from: form.emailFrom,
          to: form.emailTo,
          subject: form.emailSubject,
          apiKey: form.emailApiKey,
        },
      };
      await axios.post('/api/config', payload);
      showNotification('Instellingen opgeslagen', 'success');
      localStorage.setItem('settingsChanged', 'true');
    } catch (err) {
      console.error('Save failed', err);
      showNotification('Opslaan mislukt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    try {
      await axios.post('/api/test-email', { to: form.emailTo }, {
        headers: { 'x-api-key': form.emailApiKey },
      });
      showNotification('Test e-mail verzonden', 'success');
    } catch (error_) {
      const err = error_ as any;
      console.error('Test email failed', err);
      const message = err.response?.data?.error || err.message || 'Test e-mail mislukt';
      showNotification(`Fout bij test e-mail: ${message}`, 'error');
    }
  };

  const addTargetUrl = () => {
    const url = form.newTargetUrl.trim();
    if (!url || form.websites.some(w => w.targetUrl === url)) return;
    setForm(prev => ({
      ...prev,
      websites: [...prev.websites, { targetUrl: url, isActive: true }],
      newTargetUrl: ''
    }));
  };

  const removeTargetUrl = (url: string) => {
    setForm(prev => ({ ...prev, websites: prev.websites.filter(w => w.targetUrl !== url) }));
  };

  const toggleUrlActive = (url: string) => {
    setForm(prev => {
      const newWebsites = prev.websites.map(w => 
        w.targetUrl === url ? { ...w, isActive: !w.isActive } : w
      );
      saveOtherSettings(newWebsites); 
      return { ...prev, websites: newWebsites };
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', minHeight: '80vh' }}>
      <Box sx={{
        width: '100%',
        maxWidth: 900,
        backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.55)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(16px)',
        borderRadius: 4,
        boxShadow: '0 8px 32px 0 rgba(31,38,135,0.37)',
        border: '1px solid rgba(255,255,255,0.18)',
        p: { xs: 2, sm: 4 },
      }}>
        <Typography variant="h4" gutterBottom>Settings</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Algemeen</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField label="Login URL" fullWidth value={form.loginUrl} onChange={e => update('loginUrl', e.target.value)} required />
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <TextField label="Target URL" fullWidth value={form.newTargetUrl} onChange={e => update('newTargetUrl', e.target.value)} placeholder="https://example.com/..." />
                  </Grid>
                  <Grid item xs={12} md={4} sx={{ display:'flex', alignItems:'center'}}>
                    <Button variant="outlined" onClick={addTargetUrl} sx={{ width:{xs:'100%', md:'auto'} }}>Add Target</Button>
                  </Grid>
                  <Grid item xs={12}>
                    <List dense>
                      {form.websites.map(site => (
                        <ListItem key={site.targetUrl} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)', py:0.5 }}>
                          <ListItemText 
                            primary={site.targetUrl} 
                            sx={{ 
                              textDecoration: site.isActive ? 'none' : 'line-through', 
                              color: site.isActive ? 'inherit' : 'text.disabled' 
                            }}
                          />
                          <ListItemSecondaryAction>
                            <Switch 
                              edge="end" 
                              checked={site.isActive} 
                              onChange={() => toggleUrlActive(site.targetUrl)} 
                            />
                            <IconButton edge="end" aria-label="delete" onClick={() => removeTargetUrl(site.targetUrl)} sx={{ ml:1 }}>
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>Check Interval</InputLabel>
                      <Select value={form.schedule} label="Check Interval" onChange={e => update('schedule', e.target.value)}>
                        {INTERVALS.map(i => <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth disabled={savingTheme}>
                      <InputLabel>Theme</InputLabel>
                      <Select value={form.theme} label="Theme" onChange={e => update('theme', e.target.value)}>
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="green">Green</MenuItem>
                        <MenuItem value="orange">Orange</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Website Specifiek</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField label="Username Selector" fullWidth value={form.usernameSelector} onChange={e=>update('usernameSelector',e.target.value)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField label="Password Selector" fullWidth value={form.passwordSelector} onChange={e=>update('passwordSelector',e.target.value)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField label="Submit Selector" fullWidth value={form.submitSelector} onChange={e=>update('submitSelector',e.target.value)} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Username" fullWidth value={form.username} onChange={e=>update('username',e.target.value)} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Password" type="password" fullWidth value={form.password} onChange={e=>update('password',e.target.value)} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Email Settings</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel control={<Switch checked={form.emailEnabled} onChange={e=>update('emailEnabled',e.target.checked)} />} label="Enable Email Notifications" />
                  </Grid>
                  {form.emailEnabled && (
                    <>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                          <InputLabel>Email Service</InputLabel>
                          <Select value={form.emailService} label="Email Service" onChange={e=>update('emailService',e.target.value)}>
                            <MenuItem value="gmail">Gmail</MenuItem>
                            <MenuItem value="smtp">SMTP</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Email User" fullWidth value={form.emailUser} onChange={e=>update('emailUser',e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Email Password" type="password" fullWidth value={form.emailPass} onChange={e=>update('emailPass',e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="From Email" fullWidth value={form.emailFrom} onChange={e=>update('emailFrom',e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="To Email" fullWidth value={form.emailTo} onChange={e=>update('emailTo',e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Email Subject" fullWidth value={form.emailSubject} onChange={e=>update('emailSubject',e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Email API Key (for Email Service)" fullWidth value={form.emailApiKey} onChange={e=>update('emailApiKey', e.target.value)} helperText="Needed for external email service" />
                      </Grid>
                      <Grid item xs={12}>
                        <Button variant="outlined" color="secondary" startIcon={<MailIcon />} onClick={sendTestEmail} sx={{ mt: 1 }}>Send Test Email</Button>
                      </Grid>
                    </>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Stack 
          direction={{ xs: 'column', sm: 'row' }} 
          spacing={2} 
          sx={{ 
            mt: 3, 
            borderTop: 1, 
            borderColor: 'divider', 
            pt: 3 
          }}
        >
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={loadConfig} 
            disabled={saving || savingTheme}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Reload Config
          </Button>
          <Button 
            variant="contained" 
            startIcon={<SaveIcon />} 
            onClick={() => saveOtherSettings()} 
            disabled={saving || savingTheme}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Save Settings
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default Settings; 
import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  IconButton,
  Tooltip,
  Grid,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Snackbar,
  Stack,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, OpenInNew as OpenInNewIcon, Save as SaveIcon, Warning as WarningIcon, Email as EmailIcon, Remove as RemoveIcon, Preview as PreviewIcon } from '@mui/icons-material';
import axios from 'axios';
import { Config, NotificationSettings } from '../types';
import { useNotification } from '../contexts/NotificationContext';

const INTERVALS = [
  { label: '24 uur', value: '0 0 * * *' },
  { label: '8 uur', value: '0 */8 * * *' },
  { label: '1 uur', value: '0 * * * *' },
  { label: '30 minuten', value: '*/30 * * * *' },
  { label: '15 minuten', value: '*/15 * * * *' },
  { label: '10 minuten', value: '*/10 * * * *' },
  { label: '1 minuut', value: '* * * * *' },
];

const Settings: React.FC = () => {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<{
    website: {
      loginUrl: string;
      targetUrl: string;
      selectors: string[];
    };
    schedule: string;
    email: {
      enabled: boolean;
      service: string;
      auth: {
        user: string;
        pass: string;
      };
      from: string;
      to: string;
      subject: string;
    };
  }>({
    website: {
      loginUrl: '',
      targetUrl: '',
      selectors: []
    },
    schedule: '*/5 * * * *',
    email: {
      enabled: false,
      service: '',
      auth: {
        user: '',
        pass: ''
      },
      from: '',
      to: '',
      subject: ''
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSelector, setNewSelector] = useState('');
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [emailTestStatus, setEmailTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [emailTestMessage, setEmailTestMessage] = useState('');

  const fetchConfig = async () => {
    try {
      console.log('Debug - Fetching config...');
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      const data = await response.json();
      console.log('Debug - Received config:', data);
      
      setConfig(prev => ({
        ...prev,
        website: {
          ...prev.website,
          ...data.website,
          selectors: data.website?.selectors || []
        },
        schedule: data.schedule || prev.schedule,
        email: {
          ...prev.email,
          ...data.email,
          auth: {
            ...prev.email.auth,
            ...data.email?.auth
          }
        }
      }));
      setError(null);
    } catch (error) {
      console.error('Error fetching config:', error);
      setError('Failed to load configuration');
      showNotification('Failed to load configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [showNotification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/config', config);
      setSuccess(true);
      setError(null);
      setTimeout(() => setSuccess(false), 3000);
      localStorage.setItem('websiteConfig', JSON.stringify(config));
      showNotification('Settings saved successfully', 'success');
    } catch (err) {
      setError('Failed to save configuration');
      console.error(err);
    }
  };

  const handleChange = (field: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      website: {
        ...prev.website,
        [field]: value,
      },
    }));
  };

  const handleIntervalChange = (event: SelectChangeEvent) => {
    setConfig((prev) => ({
      ...prev,
      schedule: event.target.value
    }));
  };

  const handleAddSelector = () => {
    if (newSelector.trim()) {
      setConfig((prev) => ({
        ...prev,
        website: {
          ...prev.website,
          selectors: [...prev.website.selectors, newSelector.trim()],
        },
      }));
      setNewSelector('');
    }
  };

  const handleRemoveSelector = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      website: {
        ...prev.website,
        selectors: prev.website.selectors.filter((_, i) => i !== index),
      },
    }));
  };

  const handlePreview = async () => {
    if (!config.website.targetUrl) {
      showNotification('Please enter a target URL', 'error');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);
    setPreviewContent(null);

    try {
      const response = await axios.post('/api/proxy', { url: config.website.targetUrl });
      setPreviewContent(response.data.content);
    } catch (err) {
      setPreviewError('Failed to fetch preview content');
      showNotification('Failed to load preview', 'error');
      console.error('Preview error:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOpenWebsite = () => {
    if (config.website.targetUrl) {
      window.open(config.website.targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleTestEmail = async () => {
    if (!config.email?.to) {
      showNotification('Please enter an email address', 'error');
      return;
    }

    setEmailTestStatus('loading');
    try {
      const response = await fetch('http://localhost:3002/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_EMAIL_SERVICE_API_KEY || ''
        },
        body: JSON.stringify({ to: config.email.to })
      });

      const data = await response.json();
      if (response.ok) {
        setEmailTestStatus('success');
        setEmailTestMessage('Test email sent successfully!');
      } else {
        setEmailTestStatus('error');
        setEmailTestMessage(data.error || 'Failed to send test email');
      }
    } catch (error) {
      setEmailTestStatus('error');
      setEmailTestMessage('Failed to send test email. Please check the console for details.');
      console.error('Error sending test email:', error);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button
          variant="contained"
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchConfig();
          }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully!</Alert>}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Website Configuration
        </Typography>
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            <TextField
              fullWidth
              label="Login URL"
              value={config.website.loginUrl}
              onChange={(e) => setConfig({ ...config, website: { ...config.website, loginUrl: e.target.value } })}
            />
            <TextField
              fullWidth
              label="Target URL"
              value={config.website.targetUrl}
              onChange={(e) => setConfig({ ...config, website: { ...config.website, targetUrl: e.target.value } })}
            />
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  fullWidth
                  label="New Selector"
                  value={newSelector}
                  onChange={(e) => setNewSelector(e.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={handleAddSelector}
                  disabled={!newSelector.trim()}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
                <Button
                  variant="outlined"
                  onClick={handlePreview}
                  disabled={!config.website.targetUrl}
                  startIcon={<PreviewIcon />}
                >
                  Preview
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => window.open(config.website.targetUrl, '_blank')}
                  disabled={!config.website.targetUrl}
                  startIcon={<OpenInNewIcon />}
                >
                  Open
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {config.website.selectors.map((selector, index) => (
                  <Chip
                    key={index}
                    label={selector}
                    onDelete={() => handleRemoveSelector(index)}
                    deleteIcon={<RemoveIcon />}
                  />
                ))}
              </Box>
            </Box>
            <FormControl fullWidth>
              <InputLabel>Check Interval</InputLabel>
              <Select
                value={config.schedule}
                label="Check Interval"
                onChange={handleIntervalChange}
                required
              >
                {INTERVALS.map((interval) => (
                  <MenuItem key={interval.value} value={interval.value}>
                    {interval.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {config.website.targetUrl && (
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="subtitle1">
                      Website Preview
                    </Typography>
                  </Box>
                  {isLoadingPreview ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : previewError ? (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {previewError}
                    </Alert>
                  ) : previewContent ? (
                    <Paper sx={{ p: 2, maxHeight: '400px', overflow: 'auto' }}>
                      <div dangerouslySetInnerHTML={{ __html: previewContent }} />
                    </Paper>
                  ) : (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Click the button below to load a preview of the website.
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    URL: {config.website.targetUrl}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    startIcon={<OpenInNewIcon />}
                    onClick={handleOpenWebsite}
                    color="primary"
                  >
                    Open Website
                  </Button>
                  <Button
                    onClick={handlePreview}
                    disabled={isLoadingPreview}
                    color="primary"
                  >
                    {isLoadingPreview ? 'Loading...' : 'Load Preview'}
                  </Button>
                </CardActions>
              </Card>
            )}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
            >
              Save Settings
            </Button>
          </Stack>
        </form>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Email Configuration
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Email Recipient"
            value={config.email.to}
            onChange={(e) => setConfig({ ...config, email: { ...config.email, to: e.target.value } })}
            margin="normal"
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<EmailIcon />}
            onClick={handleTestEmail}
            disabled={emailTestStatus === 'loading'}
          >
            Send Test Email
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={emailTestStatus !== 'idle'}
        autoHideDuration={6000}
        onClose={() => setEmailTestStatus('idle')}
      >
        <Alert
          severity={emailTestStatus === 'success' ? 'success' : 'error'}
          onClose={() => setEmailTestStatus('idle')}
        >
          {emailTestMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings; 
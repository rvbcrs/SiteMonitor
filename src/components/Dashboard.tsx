import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  CssBaseline,
  Paper,
  CircularProgress,
  Alert,
  Avatar,
  Chip,
  Stack,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Button,
  Grid,
} from '@mui/material';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import { Listing, WebSocketError } from '../types';
import { AccessTime, NewReleases } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { API_URL, WS_URL } from '../config';

// default interval before config loads (in seconds)
const defaultIntervalSec = 30;

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#b7e0ef'
    },
    text: {
      primary: '#000'
    }
  },
  typography: {
    fontFamily: '"Abel", sans-serif',
  },
});

// parseCronToSeconds supports minute and hour intervals
const parseCronToSeconds = (cron: string): number => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return defaultIntervalSec;
  const [minute, hour] = parts;
  // minute intervals '*/N'
  if (minute.startsWith('*/')) {
    const n = parseInt(minute.slice(2), 10);
    return isNaN(n) ? defaultIntervalSec : n * 60;
  }
  // hour intervals '0 */H'
  if (minute === '0') {
    if (hour.startsWith('*/')) {
      const h = parseInt(hour.slice(2), 10);
      return isNaN(h) ? defaultIntervalSec : h * 3600;
    }
    // default hourly
    return 3600;
  }
  return defaultIntervalSec;
};

const Dashboard: React.FC = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [secondsUntilNextCheck, setSecondsUntilNextCheck] = useState(300);
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize Socket.IO connection using explicit WS_URL
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setError(null);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setError('Verbindingsfout met de server. Probeer het later opnieuw.');
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        socket.connect();
      }
    });

    socket.on('listingsUpdate', ({ listings }) => {
      console.log('WS update:', listings.length);
      const normalized = listings.map((l: Listing) => ({
        ...l,
        attributes: Array.isArray(l.attributes)
          ? l.attributes
          : typeof l.attributes === 'string'
          ? JSON.parse(l.attributes)
          : [],
      }));

      setListings(normalized);
      setIsLoading(false);
      setError(null);

      // Update countdown
      const last = new Date(normalized[0]?.timestamp || Date.now());
      const remaining = Math.max(0, Math.floor((last.getTime() + 5*60*1000 - Date.now())/1000));
      setSecondsUntilNextCheck(remaining);
    });

    socket.on('error', (error: WebSocketError) => {
      console.error('WebSocket error:', error);
      setError(`Fout: ${error.message}`);
    });

    return () => { socket.disconnect(); };
  }, []);

  const fetchItems = async () => {
    try {
      // Use full path for API calls
      const response = await fetch(`${API_URL}/api/items`);
      if (!response.ok) {
        throw new Error('Failed to fetch listings');
      }
      const { listings: fetched } = await response.json();
      const normalized = fetched.map((l: Listing) => ({
        ...l,
        attributes: Array.isArray(l.attributes)
          ? l.attributes
          : typeof l.attributes === 'string'
          ? JSON.parse(l.attributes)
          : [],
      }));

      setListings(normalized);
      setIsLoading(false);
      setError(null);

      const last = new Date(normalized[0]?.timestamp || Date.now());
      const remaining = Math.max(0, Math.floor((last.getTime() + 5*60*1000 - Date.now())/1000));
      setSecondsUntilNextCheck(remaining);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Fout bij ophalen van de gegevens');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (!isManualRefresh) {
      const timer = setInterval(() => {
        setSecondsUntilNextCheck(prev => {
          if (prev <= 1) {
            fetchItems();
            return 300;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isManualRefresh]);

  const handleCheckNow = async () => {
    try {
      setIsManualRefresh(true);
      setSecondsUntilNextCheck(300);
      // Use full path for API calls
      const response = await fetch(`${API_URL}/api/check`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to trigger check');
      }
      await fetchItems();
    } catch (error) {
      console.error('Error triggering check:', error);
      setError('Fout bij het uitvoeren van de check');
    } finally {
      setIsManualRefresh(false);
    }
  };

  // Helper function to parse Dutch date string to Date object
  const parseDutchDate = (dateStr: string): Date => {
    if (dateStr.toLowerCase() === 'vandaag') {
      return new Date();
    }
    
    const monthMap: { [key: string]: number } = {
      'jan': 0, 'feb': 1, 'mrt': 2, 'apr': 3, 'mei': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'dec': 11
    };
    
    const parts = dateStr.split(' ');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = monthMap[parts[1].toLowerCase()];
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(); // fallback
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };

  const getProxiedImageUrl = (imageUrl: string) => {
    if (!imageUrl) return '';
    return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  };

  // helper to format seconds into HH:mm:ss
  const formatDuration = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          bgcolor: 'background.default',
          minHeight: '100vh',
          py: 6,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1200, mx: 2 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" component="h2">
                Live Items Feed
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {listings.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {format(new Date(listings[0].timestamp), 'HH:mm:ss', { locale: nl })}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <AccessTime fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Next check in: {formatDuration(secondsUntilNextCheck)}
                  </Typography>
                </Stack>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleCheckNow}
                >
                  Check Now
                </Button>
              </Stack>
            </Stack>
          </Box>

          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ p: 2 }}>
            <AnimatePresence initial={false}>
              {listings.map((item) => (
                <Grid item xs={12} key={item.id} component={motion.div}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25 }}
                >
                  <Card elevation={3} sx={{ display: 'flex', mb: 4, borderRadius: 2, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    {/* Left (red) side */}
                    <Box sx={{ width: 220, px: 3, py: 4, bgcolor: '#c96b60', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                       <Chip label={item.seller || item.title.split(' ')[0]} sx={{ bgcolor: '#b45b52', color: '#fff', mb: 3, fontWeight: 600, fontSize: 14 }} />
                       {item.imageUrl ? (
                           <Avatar src={getProxiedImageUrl(item.imageUrl)} alt={item.title} sx={{ width: 120, height: 120, mb: 3 }} />
                       ) : (
                           <Avatar sx={{ width: 120, height: 120, mb: 3, bgcolor: 'grey.200' }}>
                               {item.title.charAt(0)}
                           </Avatar>
                       )}
                       <Chip label={item.price} sx={{ bgcolor: '#b45b52', color: '#fff', fontWeight: 600, fontSize: 14 }} />
                    </Box>
                    {/* Right (white) side */}
                    <Box sx={{ flex: 1, backgroundColor: '#fff', p: 3, display: 'flex', flexDirection: 'column' }}>
                       <CardContent sx={{ flex: '1 0 auto', pb: 0 }}>
                           <Typography variant="h5" component="div" sx={{ fontWeight: 700, color: '#000', mb: 2 }}>{item.title}</Typography>
                           <Typography variant="body1" sx={{ color: '#000', mb: 2 }}>
                               {item.description}
                           </Typography>
                       </CardContent>
                       <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                           <Button
                             variant="contained"
                             size="small"
                             href={item.url}
                             target="_blank"
                             rel="noopener noreferrer"
                             sx={{ textTransform: 'none' }}
                           >
                             Zie omschrijving
                           </Button>
                           <Typography variant="caption" sx={{ color: '#000' }}>
                               {formatDate(item.date)}
                           </Typography>
                           <Typography variant="caption" sx={{ color: '#000' }}>
                               {item.location}
                           </Typography>
                       </Box>
                       <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                           {Array.isArray(item.attributes) && item.attributes.map((attr: string, i: number) => (
                               <Chip key={i} label={attr} size="small" variant="outlined" sx={{ fontSize: 12, color: '#000', borderColor: '#ccc' }} />
                           ))}
                       </Box>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </AnimatePresence>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default Dashboard; 
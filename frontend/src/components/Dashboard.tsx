import React, { useEffect, useState, useRef } from 'react';
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
  Backdrop,
} from '@mui/material';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import { Listing, WebSocketError } from '../types';
import { AccessTime } from '@mui/icons-material';
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
  const [schedule, setSchedule] = useState<string>('');
  const [intervalSec, setIntervalSec] = useState<number>(defaultIntervalSec);
  const [secondsUntilNextCheck, setSecondsUntilNextCheck] = useState<number | null>(null);
  const [nextServerCheck, setNextServerCheck] = useState<number | null>(null);
  const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const checkingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize Socket.IO connection using explicit WS_URL
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected, id:', socket.id);
      setError(null);
    });

    // Log all incoming socket events for debugging
    socket.onAny((event, ...args) => {
      console.log('WS event received:', event, args);
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

    socket.on('listingsUpdate', ({ listings, nextCheck }) => {
      setIsChecking(false);
      setNextServerCheck(nextCheck);
      // Update last updated time on each listings update
      setLastTimestamp(new Date());
      console.log('WS listingsUpdate:', listings.length, 'nextCheck:', nextCheck);
      const normalized = listings.map((l: Listing) => ({
        ...l,
        attributes: Array.isArray(l.attributes)
          ? l.attributes
          : typeof l.attributes === 'string'
          ? JSON.parse(l.attributes)
          : [],
      }));

      // Sort items by their parsed date (newest first, with 'Vandaag' at top)
      const sorted = normalized.sort((a: Listing, b: Listing) => {
        const dA = parseDutchDate(a.date);
        const dB = parseDutchDate(b.date);
        return dB.getTime() - dA.getTime();
      });
      setListings(sorted);
      setIsLoading(false);
      setError(null);
    });

    socket.on('nextCheck', ({ nextCheck }) => {
      setIsChecking(false);
      setNextServerCheck(nextCheck);
      console.log('WS nextCheck event received:', nextCheck);
    });

    socket.on('error', (error: WebSocketError) => {
      console.error('WebSocket error:', error);
      setError(`Fout: ${error.message}`);
    });

    socket.on('checking', () => {
      // Prevent stale loader: clear existing timeout and start a new one
      if (checkingTimeout.current) clearTimeout(checkingTimeout.current);
      setIsChecking(true);
      // Auto-hide spinner after 4 min in case something goes wrong
      checkingTimeout.current = setTimeout(() => setIsChecking(false), 4 * 60 * 1000);
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

      // Sort items by their parsed date before setting
      const sorted = normalized.sort((a: Listing, b: Listing) => {
        const dA = parseDutchDate(a.date);
        const dB = parseDutchDate(b.date);
        return dB.getTime() - dA.getTime();
      });
      setListings(sorted);
      // Update last updated time after initial fetch
      setLastTimestamp(new Date());
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Fout bij ophalen van de gegevens');
      setIsLoading(false);
    }
  };

  // Fetch initial items on component mount
  useEffect(() => {
    fetchItems();
  }, []);

  // New countdown effect driven by nextServerCheck
  useEffect(() => {
    if (nextServerCheck === null) {
      console.log('[Countdown Effect] nextServerCheck is null, timer not started.');
      return; // Exit if we don't have the server timestamp yet
    }
 
    console.log(`[Countdown Effect] Starting timer. nextServerCheck: ${new Date(nextServerCheck).toISOString()}`);
    // Immediately set remaining time without waiting 1s
    setSecondsUntilNextCheck(Math.max(0, Math.floor((nextServerCheck - Date.now()) / 1000)));
    const timer = setInterval(() => {
      const rem = Math.max(0, Math.floor((nextServerCheck - Date.now()) / 1000));
      setSecondsUntilNextCheck(rem);
    }, 1000);

    // Cleanup function
    return () => {
      console.log('[Countdown Effect] Cleaning up timer.');
      clearInterval(timer);
    };
  }, [nextServerCheck]); // Dependency array is correct

  const handleCheckNow = async (triggeredByScheduleChange = false) => {
    if (isChecking) return; // Already running
    try {
      // Reset timer immediately based on CURRENT intervalSec
      setSecondsUntilNextCheck(intervalSec);

      // Trigger check on backend
      console.log(`Triggering check now (schedule change: ${triggeredByScheduleChange})...`);
      const response = await fetch(`${API_URL}/api/check`, {
        method: 'POST',
      });
      if (!response.ok) {
        if (response.status === 429) {
          setError('Er draait al een controle. Even geduld aub.');
          return;
        }
        throw new Error('Failed to trigger check');
      }
      // Let the WebSocket handle the listings/nextCheck update after the check
      // await fetchItems(); // No need to fetch here anymore

    } catch (error) {
      console.error('Error triggering check:', error);
      setError('Fout bij het uitvoeren van de check');
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
      let year = parseInt(parts[2], 10);
      // if two-digit year, assume 2000+year
      if (!isNaN(year) && year < 100) {
        year += 2000;
      }
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
    console.log('[Dashboard.tsx] Using API_URL for proxy:', API_URL);
    // Use full API_URL to ensure correct host/port
    return `${API_URL}/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  };

  // helper to format seconds into HH:mm:ss
  const formatDuration = (totalSeconds: number | null): string => {
    if (totalSeconds === null) return '--:--:--'; // Show placeholder if null
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // Fetch schedule from API initially and on schedule change
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/config`);
        const data = await res.json();
        const newSchedule = data.schedule;
        if (newSchedule !== schedule) {
          console.log('Fetched new schedule:', newSchedule);
          setSchedule(newSchedule);
          const secs = parseCronToSeconds(newSchedule);
          setIntervalSec(secs);
          // Trigger a check immediately since schedule changed
          // (nextCheck will be updated via WebSocket after check completes)
          handleCheckNow(true); // Pass flag to indicate schedule change trigger
        }
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };
    loadConfig();
    // Dependency array includes 'schedule' now, but initialized empty
    // so it runs on mount and whenever schedule changes internally
  }, [schedule]); // Rerun if schedule state changes

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
      <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={isChecking}>
        <CircularProgress color="inherit" />
      </Backdrop>
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
                Live Items Feed ({listings.length})
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {lastTimestamp && (
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {format(lastTimestamp, 'HH:mm:ss', { locale: nl })}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <AccessTime fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Next check in: {formatDuration(secondsUntilNextCheck)}
                  </Typography>
                  {isChecking && <CircularProgress size={16} sx={{ ml: 0.5 }} />}
                </Stack>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleCheckNow(false)}
                  disabled={isChecking}
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
import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  FormControl,
  InputLabel,
  Tabs,
  Tab
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
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

// parseCronToSeconds supports minute and hour intervals
const parseCronToSeconds = (cron: string | null | undefined): number => {
  if (!cron || typeof cron !== 'string') return defaultIntervalSec;
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
  const theme = useTheme();
  const [groups, setGroups] = useState<{ [key: string]: Listing[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<string>('');
  const [intervalSec, setIntervalSec] = useState<number>(defaultIntervalSec);
  const [secondsUntilNextCheck, setSecondsUntilNextCheck] = useState<number | null>(null);
  const [nextServerCheck, setNextServerCheck] = useState<number | null>(null);
  const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const navigate = useNavigate();
  const checkingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Compute sorted keys for stable tab order
  const groupKeys = useMemo(() => Object.keys(groups).sort(), [groups]);

  // Reset tabIndex when keys change and current index out-of-range
  useEffect(() => {
    if (tabIndex >= groupKeys.length) {
      setTabIndex(0);
    }
  }, [groupKeys, tabIndex]);

  // Helper to derive a short label from Marktplaats URLs
  const getTabLabel = (url: string) => {
    const match = url.match(/\/q\/([^/]+)\//);
    let raw = match && match[1] ? match[1] : url;
    try { raw = decodeURIComponent(raw); } catch (_) {}
    // Vervang plustekens door spaties voor leesbaarheid
    return raw.replace(/\+/g, ' ');
  };

  // Extract primary token for filtering (first search word)
  const getPrimaryToken = (url: string) => {
    const label = getTabLabel(url);
    // Neem eerste deel vóór spatie of +
    return label.split(/[+\s]/)[0].toLowerCase();
  };

  const getFilteredItems = (key: string) => {
    const token = getPrimaryToken(key);
    const items = groups[key] || [];
    if (!token) return items;
    return items.filter((itm) => itm.title?.toLowerCase().includes(token));
  };

  useEffect(() => {
    // Initialize Socket.io connection using explicit WS_URL
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

      // Groepeer per selector (of 'default')
      const groupedResult: { [key: string]: Listing[] } = {};
      normalized.forEach((l: Listing) => {
        const key = (l as any).selector || 'default';
        if (!groupedResult[key]) groupedResult[key] = [];
        groupedResult[key].push(l);
      });

      // Filter out groep-sleutels die geen geldige URL lijken te zijn (bv. CSS-selectoren)
      const filteredResult: { [key: string]: Listing[] } = {};
      Object.entries(groupedResult).forEach(([k, v]) => {
        if (/^https?:\/\//i.test(k)) {
          filteredResult[k] = v;
        }
      });

      setGroups(filteredResult);
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
      const resp = await response.json();
      const grouped = resp.grouped && typeof resp.grouped === 'object' ? resp.grouped : {};
      const newGroups: { [key: string]: Listing[] } = {};
      Object.entries(grouped).forEach(([key, arr]: any) => {
        const norm = (arr as Listing[]).map((l: Listing) => ({
          ...l,
          attributes: Array.isArray(l.attributes)
            ? l.attributes
            : typeof l.attributes === 'string'
            ? JSON.parse(l.attributes)
            : [],
        }));
        newGroups[key] = norm;
      });

      // Filter outgeldige keys weer uit (geen URL)
      const filteredGroups: { [key: string]: Listing[] } = {};
      Object.entries(newGroups).forEach(([k,v])=>{
        if(/^https?:\/\//i.test(k)) {
          filteredGroups[k]=v;
        }
      });

      setGroups(filteredGroups);
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

  // Totaal van gefilterde items (voor Live Items Feed)
  const totalFilteredCount = useMemo(()=>{
    return groupKeys.reduce((acc,key)=>acc+getFilteredItems(key).length,0);
  },[groupKeys, groups]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={isChecking}>
        <CircularProgress color="inherit" />
      </Backdrop>
      <Box
        sx={{
          minHeight: '100vh',
          py: 6,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1200, mx: 2 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} // Responsive direction
              spacing={{ xs: 1, sm: 2 }} // Responsive spacing
              justifyContent="space-between" 
              alignItems={{ xs: 'flex-start', sm: 'center' }} // Responsive alignment
            >
              <Typography variant="h6" component="h2" sx={{ mb: { xs: 1, sm: 0 } }}> {/* Margin bottom on mobile */}
                Live Items Feed ({totalFilteredCount})
              </Typography>
              <Stack 
                direction={{ xs: 'column', md: 'row' }} // Laatste groep kan ook stacken op mobiel/tablet
                spacing={2} 
                alignItems={{ xs: 'flex-start', md: 'center' }} // Align start op mobiel
              >
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
                  sx={{ width: { xs: '100%', md: 'auto'} }} // Full width op xs
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

          {/* Tabs for targetUrls */}
          {groupKeys.length>1 && (
            <Tabs value={tabIndex} onChange={(_,v)=>setTabIndex(v)} variant="scrollable" scrollButtons="auto" sx={{ mb:2 }}>
              {groupKeys.map((key) => (
                <Tab key={key} label={`${getTabLabel(key)} (${getFilteredItems(key).length})`} />
              ))}
            </Tabs>
          )}

          {/* Content for selected tab */}
          {groupKeys.length>0 && (
            <Grid container spacing={2} sx={{ p: 2 }}>
              <AnimatePresence initial={false}>
                {getFilteredItems(groupKeys[tabIndex]).map((item)=>(
                  <Grid item xs={12} key={item.id} component={motion.div}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Card 
                      elevation={3} 
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' }, // Responsive direction
                        mb: 4, 
                        borderRadius: 2, 
                        overflow: 'hidden', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}
                    >
                      {/* Left side */}
                      <Box 
                        sx={{
                          width: { xs: '100%', md: 220 }, // Responsive width
                          px: 3, py: 4, 
                          bgcolor: 'primary.main', 
                          color: 'primary.contrastText', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center' 
                        }}
                      >
                         <Chip
                           label={item.seller || item.title.split(' ')[0]}
                           sx={{
                              bgcolor: alpha(theme.palette.common.black, 0.2),
                              color: '#fff',
                              mb: { xs: 2, md: 3 }, // Aangepaste margin voor mobiel
                              fontWeight: 600,
                              fontSize: 14
                           }}
                         />
                         {item.imageUrl ? (
                             <Avatar 
                               src={getProxiedImageUrl(item.imageUrl)} 
                               alt={item.title} 
                               sx={{ width: { xs: 100, md: 120 }, height: { xs: 100, md: 120 }, mb: { xs: 2, md: 3 } }} // Responsive avatar
                             />
                         ) : (
                             <Avatar 
                               sx={{ 
                                 width: { xs: 100, md: 120 }, height: { xs: 100, md: 120 }, mb: { xs: 2, md: 3 }, // Responsive avatar
                                 bgcolor: 'background.paper',
                                 color: 'text.secondary'
                              }}>
                                 {item.title.charAt(0)}
                             </Avatar>
                         )}
                         <Chip
                           label={item.price}
                           sx={{
                             bgcolor: alpha(theme.palette.common.black, 0.2),
                             color: '#fff',
                             fontWeight: 600,
                             fontSize: 14
                           }}
                          />
                      </Box>
                      {/* Right side */}
                      <Box sx={{ flex: 1, backgroundColor: 'background.paper', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column' }}> {/* Responsive padding */}
                         <CardContent sx={{ flex: '1 0 auto', pb: 0 }}>
                               <Typography variant="h5" component="div" sx={{ fontWeight: 700, color: 'text.primary', mb: 2, fontSize: { xs: '1.25rem', md: '1.5rem' } }}> {/* Responsive font size */}
                                   {item.title}
                               </Typography>
                               <Typography variant="body1" sx={{ color: 'text.secondary', mb: 2, fontSize: { xs: '0.875rem', md: '1rem' } }}> {/* Responsive font size */}
                                   {item.description}
                               </Typography>
                           </CardContent>
                           <CardActions 
                             sx={{ 
                               pt: 1, 
                               display: 'flex', 
                               flexDirection: { xs: 'column', sm: 'row' }, 
                               justifyContent: 'space-between', 
                               alignItems: { xs: 'stretch', sm: 'center' } 
                             }}
                           >
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: { xs: 1, sm: 0 }, width: { xs: '100%', sm: 'auto'} }}>
                                  {item.url && (
                                      <Button 
                                        size="small" 
                                        href={item.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        sx={{ width: { xs: '100%', sm: 'auto' } }} 
                                      >
                                          Zie omschrijving
                                      </Button>
                                  )}
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.disabled', fontSize: { xs: '0.75rem', sm: 'caption.fontSize' } }}> {/* Smaller text on mobile */}
                                 <AccessTime fontSize="inherit" />
                                 <Typography variant="caption">{item.date || 'N/A'}</Typography>
                                 <Typography variant="caption">•</Typography>
                                 <Typography variant="caption">{item.location || 'N/A'}</Typography>
                              </Stack>
                           </CardActions>
                           {item.attributes && item.attributes.length > 0 && (
                             <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 2 }, pt: 1 }}> {/* Responsive padding */}
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap> {/* useFlexGap for better spacing with wrap */}
                                    {item.attributes.map((attr, index) => (
                                        <Chip key={index} label={attr} size="small" variant="outlined" />
                                    ))}
                                </Stack>
                             </Box>
                           )}
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </AnimatePresence>
              </Grid>
          )}
        </Box>
      </Box>
    </>
  );
};

export default Dashboard; 
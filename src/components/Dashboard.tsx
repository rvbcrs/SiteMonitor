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
import axios from 'axios';
import { Item } from '../types';
import { AccessTime, NewReleases } from '@mui/icons-material';

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
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  // scheduleSec is aantal seconden tussen checks
  const [scheduleSec, setScheduleSec] = useState<number>(defaultIntervalSec);
  // secondsRemaining is countdown naar volgende check
  const [secondsRemaining, setSecondsRemaining] = useState<number>(defaultIntervalSec);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/items');
      const itemsData = response.data.listings || [];
      const transformedItems = itemsData.map((listing: any, index: number) => ({
        id: `item-${index}`,
        title: listing.title,
        price: listing.price,
        description: listing.description,
        location: listing.location,
        date: listing.date,
        seller: listing.seller,
        url: listing.url,
        selector: listing.selector || 'default',
        imageUrl: listing.imageUrl,
        condition: listing.condition,
        category: listing.category,
        attributes: Array.isArray(listing.attributes)
          ? listing.attributes
          : (() => {
              try {
                return JSON.parse(listing.attributes || '[]');
              } catch {
                return [];
              }
            })()
      }));

      // Sort items by date (newest first)
      transformedItems.sort((a: Item, b: Item) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Find new items by comparing with existing ones
      const existingIds = new Set(items.map((item: Item) => item.id));
      const newItems = transformedItems.filter((item: Item) => !existingIds.has(item.id));

      if (newItems.length > 0) {
        setHighlightIds(new Set(newItems.map((item: Item) => item.id)));
      }

      setItems(transformedItems);
      setLastCheck(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch items');
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Laad schedule uit settings en trigger eerste fetch
  useEffect(() => {
    axios.get('/api/config')
      .then(res => {
        const cron = res.data.schedule as string;
        const sec = parseCronToSeconds(cron);
        setScheduleSec(sec);
        setSecondsRemaining(sec);
        fetchItems();
      })
      .catch(err => {
        console.error('Error loading schedule config:', err);
        fetchItems();
      });
  }, []);

  // Poll op basis van scheduleSec
  useEffect(() => {
    const id = setInterval(fetchItems, scheduleSec * 1000);
    return () => clearInterval(id);
  }, [scheduleSec]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : scheduleSec));
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduleSec]);

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

  if (loading) {
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
                {lastCheck && (
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {lastCheck.toLocaleTimeString()}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <AccessTime fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Next check in: {formatDuration(secondsRemaining)}
                  </Typography>
                </Stack>
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
              {items.map((item) => (
                <Grid item xs={12} key={item.id} component={motion.div}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25 }}
                >
                  <Card elevation={highlightIds.has(item.id) ? 8 : 3} sx={{ display: 'flex', mb: 4, borderRadius: 2, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
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
                           <Button size="small" href={item.url} sx={{ textTransform: 'none' }}>Zie omschrijving</Button>
                           <Typography variant="caption" sx={{ color: '#000' }}>
                               {formatDate(item.date)}
                           </Typography>
                           <Typography variant="caption" sx={{ color: '#000' }}>
                               {item.location}
                           </Typography>
                       </Box>
                       <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                           {item.attributes.map((attr: string, i: number) => (
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
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

const pollingInterval = 30000; // 30 seconds

const darkTheme = createTheme({
  palette: { mode: 'dark' },
});

const Dashboard: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

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

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, pollingInterval);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getProxiedImageUrl = (imageUrl: string) => {
    if (!imageUrl) return '';
    return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
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
        <Paper elevation={3} sx={{ width: '100%', maxWidth: 1200, mx: 2 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" component="h2">
                Live Items Feed
              </Typography>
              {lastCheck && (
                <Typography variant="caption" color="text.secondary">
                  Last updated: {lastCheck.toLocaleTimeString()}
                </Typography>
              )}
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
                  <Paper elevation={highlightIds.has(item.id) ? 4 : 1} sx={{ p: 2, display: 'flex', mb: 2 }}>
                    <Box sx={{ width: 200, height: 150, flexShrink: 0, bgcolor: 'grey.100' }}>
                      {item.imageUrl ? (
                        <Box component="img" src={getProxiedImageUrl(item.imageUrl)} alt={item.title}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <Box sx={{ width: '100%', height: '100%', bgcolor: 'grey.200' }} />
                      )}
                    </Box>
                    <Box sx={{ flexGrow: 1, pl: 2, display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{item.title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Button size="small" href={item.url}>Zie omschrijving</Button>
                          <Typography component="a" href={item.url} sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 500 }}>
                            {item.seller}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ my: 1, flexGrow: 1 }}>
                        {item.description}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 2, mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">{formatDate(item.date)}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.location}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {item.attributes.map((attr: string, i: number) => (
                          <Chip key={i} label={attr} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </AnimatePresence>
          </Grid>
        </Paper>
      </Box>
    </ThemeProvider>
  );
};

export default Dashboard; 
import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  Tabs,
  Tab,
  CardMedia,
  Container,
  Grid,
} from '@mui/material';
import { AccessTime, NewReleases, History } from '@mui/icons-material';
import axios from 'axios';
import { Item } from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Dashboard: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [tabValue, setTabValue] = useState(0);

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
        url: listing.link,
        selector: listing.selector || 'default',
        imageUrl: listing.imageUrl
      }));
      // Sort items by date (newest first)
      transformedItems.sort((a: Item, b: Item) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    const interval = setInterval(fetchItems, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const getProxiedImageUrl = (imageUrl: string) => {
    if (!imageUrl) return '';
    return `${process.env.REACT_APP_API_URL}/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  };

  const renderItemCard = (item: Item) => (
    <Grid component="div" sx={{ gridColumn: { xs: '1 / -1', sm: '1 / span 6', md: '1 / span 4' } }} key={item.id}>
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.02)' } }}>
        {item.imageUrl && (
          <CardMedia
            component="img"
            height="250"
            image={getProxiedImageUrl(item.imageUrl)}
            alt={item.title}
            sx={{ objectFit: 'cover', cursor: 'pointer' }}
            onClick={() => window.open(item.url, '_blank')}
          />
        )}
        <CardContent sx={{ flexGrow: 1 }}>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Typography variant="h6" component="div" sx={{ wordBreak: 'break-word', fontWeight: 'bold' }}>
                {item.title || 'No title available'}
              </Typography>
              {item.price && (
                <Chip
                  label={item.price}
                  color="primary"
                  size="small"
                  sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                />
              )}
            </Box>

            {item.description && (
              <Typography variant="body2" color="text.secondary" sx={{ 
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {item.description}
              </Typography>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {item.date && (
                  <Chip
                    icon={<AccessTime />}
                    label={formatDate(item.date)}
                    size="small"
                    variant="outlined"
                  />
                )}
                {item.location && (
                  <Chip
                    label={item.location}
                    size="small"
                    variant="outlined"
                  />
                )}
                {item.seller && (
                  <Chip
                    label={`Seller: ${item.seller}`}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>

              {item.condition && (
                <Chip
                  label={`Condition: ${item.condition}`}
                  size="small"
                  variant="outlined"
                  color="secondary"
                />
              )}

              {item.category && (
                <Chip
                  label={`Category: ${item.category}`}
                  size="small"
                  variant="outlined"
                  color="info"
                />
              )}
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {item.selector ? `Detected via: ${item.selector}` : 'Detected via: default'}
              </Typography>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Chip
                    label="View on Marktplaats"
                    color="primary"
                    variant="outlined"
                    size="small"
                    sx={{ cursor: 'pointer' }}
                  />
                </a>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );

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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h4">Dashboard</Typography>
              {lastCheck && (
                <Typography variant="body2" color="text.secondary">
                  Last checked: {lastCheck.toLocaleTimeString()}
                </Typography>
              )}
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange}>
                <Tab icon={<NewReleases />} label="New Items" />
                <Tab icon={<History />} label="All Items" />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)'
                },
                gap: 3
              }}>
                {items.filter(item => {
                  const itemDate = new Date(item.date);
                  const now = new Date();
                  const hoursDiff = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
                  return hoursDiff <= 24; // Show items from the last 24 hours as "new"
                }).map(renderItemCard)}
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)'
                },
                gap: 3
              }}>
                {items.map(renderItemCard)}
              </Box>
            </TabPanel>
          </Stack>
        </Box>
      </Box>
    </Container>
  );
};

export default Dashboard; 
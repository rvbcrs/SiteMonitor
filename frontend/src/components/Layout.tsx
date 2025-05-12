import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar 
        position="sticky" 
        elevation={0}
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.75),
          backdropFilter: 'blur(10px)',
          borderRadius: '0 0 15px 15px',
          top: 0,
        }}
      >
        <Toolbar sx={{ mx: 1 }}>
          <img src="/logo.png" alt="Logo" style={{ height: '40px', marginRight: '16px' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Marktplaats Monitor
          </Typography>
          <Button
            color="inherit"
            component={RouterLink}
            to="/"
            startIcon={<DashboardIcon />}
          >
            Dashboard
          </Button>
          <Button
            color="inherit"
            component={RouterLink}
            to="/settings"
            startIcon={<SettingsIcon />}
          >
            Settings
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ pt: '80px', mb: 4, flex: 1 }}>
        {children}
      </Container>
    </Box>
  );
};

export default Layout; 
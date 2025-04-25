import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, Box, ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import { NotificationProvider } from './contexts/NotificationContext';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <NotificationProvider>
        <Router>
          <Box sx={{ flexGrow: 1 }}>
            <AppBar position="static">
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Website Monitor
                </Typography>
                <Button color="inherit" component={Link} to="/">
                  Dashboard
                </Button>
                <Button color="inherit" component={Link} to="/settings">
                  Settings
                </Button>
              </Toolbar>
            </AppBar>
            <Container maxWidth="lg" sx={{ mt: 4 }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Container>
          </Box>
        </Router>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;

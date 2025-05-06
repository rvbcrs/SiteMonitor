import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Definieer de beschikbare thema's zoals in Dashboard.tsx
// (Idealiter zouden deze op een centrale plek gedefinieerd worden)
const lightTheme = createTheme({
  palette: { mode: 'light', background: { default: '#f0f4f7' } }, // Iets neutraler lichtblauw
  typography: { fontFamily: '"Abel", sans-serif' },
});

const greenTheme = createTheme({
  palette: { mode: 'dark', background: { default: '#212121', paper: '#333333' }, primary: { main: '#4caf50' } },
  typography: { fontFamily: '"Abel", sans-serif' },
});

const orangeTheme = createTheme({
  palette: { mode: 'dark', background: { default: '#212121', paper: '#333333' }, primary: { main: '#ff9800' } },
  typography: { fontFamily: '"Abel", sans-serif' },
});

const themes: { [key: string]: ReturnType<typeof createTheme> } = {
  light: lightTheme,
  green: greenTheme,
  orange: orangeTheme,
};

interface ThemeContextProps {
  themeName: string;
  setTheme: (name: string) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Haal opgeslagen thema op of gebruik 'light' als default
  const [themeName, setThemeName] = useState<string>(() => {
    const storedTheme = localStorage.getItem('appTheme');
    return storedTheme && themes[storedTheme] ? storedTheme : 'light';
  });

  // Sla thema op in localStorage bij wijziging
  useEffect(() => {
    localStorage.setItem('appTheme', themeName);
  }, [themeName]);

  // Functie om thema te wijzigen
  const setTheme = (name: string) => {
    if (themes[name]) {
      setThemeName(name);
    } else {
      console.warn(`Theme "${name}" not found, defaulting to light.`);
      setThemeName('light');
    }
  };

  // Selecteer het actieve MUI thema object
  const activeTheme = useMemo(() => themes[themeName] || themes.light, [themeName]);

  return (
    <ThemeContext.Provider value={{ themeName, setTheme }}>
      <MuiThemeProvider theme={activeTheme}>
        <CssBaseline /> {/* Zorgt voor basis styling en achtergrondkleur */}
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Hook om de context te gebruiken
export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeContextProvider');
  }
  return context;
}; 
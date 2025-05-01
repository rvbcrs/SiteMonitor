import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

interface EmailServiceStatusProps {
  serviceUrl?: string;
}

enum ServiceStatus {
  CHECKING = 'checking',
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error'
}

export function EmailServiceStatus({ serviceUrl = import.meta.env.VITE_EMAIL_SERVICE_URL }: EmailServiceStatusProps) {
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.CHECKING);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkServiceStatus = async () => {
    if (!serviceUrl) {
      setStatus(ServiceStatus.ERROR);
      setError('Email service URL not configured');
      setLastChecked(new Date());
      return;
    }

    try {
      setStatus(ServiceStatus.CHECKING);
      const response = await fetch(`${serviceUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setStatus(ServiceStatus.ONLINE);
        setError(null);
      } else {
        setStatus(ServiceStatus.ERROR);
        setError(`Service returned status ${response.status}`);
      }
    } catch (err) {
      console.error('Error checking email service status:', err);
      setStatus(ServiceStatus.OFFLINE);
      setError('Could not connect to email service');
    } finally {
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    checkServiceStatus();
    // Check status every 60 seconds
    const interval = setInterval(checkServiceStatus, 60000);
    return () => clearInterval(interval);
  }, [serviceUrl]);

  const renderStatusIndicator = () => {
    switch (status) {
      case ServiceStatus.ONLINE:
        return (
          <div className="flex items-center text-supabase-green bg-green-900/30 px-3 py-1 rounded-full text-sm border border-green-900/50">
            <CheckCircle className="h-4 w-4 mr-1" />
            <span>Email Service Online</span>
          </div>
        );
      case ServiceStatus.OFFLINE:
        return (
          <div className="flex items-center text-red-400 bg-red-900/30 px-3 py-1 rounded-full text-sm border border-red-900/50">
            <AlertCircle className="h-4 w-4 mr-1" />
            <span>Email Service Offline</span>
          </div>
        );
      case ServiceStatus.ERROR:
        return (
          <div className="flex items-center text-orange-400 bg-orange-900/30 px-3 py-1 rounded-full text-sm border border-orange-900/50">
            <AlertTriangle className="h-4 w-4 mr-1" />
            <span>Email Service Error</span>
          </div>
        );
      case ServiceStatus.CHECKING:
      default:
        return (
          <div className="flex items-center text-blue-400 bg-blue-900/30 px-3 py-1 rounded-full text-sm border border-blue-900/50">
            <div className="h-4 w-4 mr-1 border-t-2 border-blue-400 rounded-full animate-spin"></div>
            <span>Checking Email Service...</span>
          </div>
        );
    }
  };

  return (
    <div className="inline-block">
      {renderStatusIndicator()}
      
      {error && (
        <div className="text-xs text-red-400 mt-1 ml-2">
          Error: {error}
        </div>
      )}
      
      {lastChecked && status !== ServiceStatus.CHECKING && (
        <div className="text-xs text-supabase-muted mt-1 ml-2">
          Last checked: {lastChecked.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
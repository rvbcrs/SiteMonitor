export interface Listing {
  id: string;
  title: string;
  price: string;
  url: string;
  imageUrl: string;
  location: string;
  date: string;
  description: string;
  seller: string;
  condition: string | null;
  category: string | null;
  attributes: string[];
  selector: string;
  timestamp: string;
  isNew: boolean;
  isUpdated: boolean;
}

export interface WebsiteConfig {
  loginUrl: string;
  targetUrl: string;
  selectors: string[];
}

export interface Config {
  website: {
    loginUrl: string;
    targetUrl: string;
    selectors: string[];
    frequency: string;
  };
  email: {
    enabled: boolean;
    service: string;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
    to: string;
    subject: string;
  };
  dataDir: string;
  schedule: string;
}

export interface Content {
  html: string;
  listings: Listing[];
  timestamp: string;
}

export interface Item {
  id: string;
  title: string;
  price: string;
  description: string;
  location: string;
  date: string;
  seller: string;
  url: string;
  selector: string;
  imageUrl?: string;
  condition?: string;
  category?: string;
  attributes: string[];
}

export interface Monitor {
  id: string;
  url: string;
  selector: string;
  interval: number;
  last_checked?: string;
  last_value?: string;
}

export interface GroupedMonitors {
  [url: string]: {
    monitors: Monitor[];
    isExpanded: boolean;
  };
}

export interface NotificationSettings {
  enabled: boolean;
  email: string;
  frequency: "immediate" | "daily" | "weekly";
}

export interface WebSocketMessage {
  type: "new_listing" | "updated_listing" | "error";
  data: Listing | string;
}

export interface WebSocketError {
  message: string;
  code: string;
}

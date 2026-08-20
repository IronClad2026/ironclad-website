export type WebsiteTrafficMetric = {
  visitors: number;
  pageViews: number;
};

export type WebsiteTrafficDailyPoint = WebsiteTrafficMetric & {
  date: string;
};

export type WebsiteTrafficBreakdownPoint = WebsiteTrafficMetric & {
  label: string;
};

export type WebsiteTrafficAnalyticsAvailable = {
  status: "available";
  generatedAt: string;
  timezone: "UTC";
  summary: {
    today: WebsiteTrafficMetric;
    sevenDays: WebsiteTrafficMetric;
    thirtyDays: WebsiteTrafficMetric;
  };
  trend: WebsiteTrafficDailyPoint[];
  breakdowns: {
    routes: WebsiteTrafficBreakdownPoint[];
    countries: WebsiteTrafficBreakdownPoint[];
    referrers: WebsiteTrafficBreakdownPoint[];
    devices: WebsiteTrafficBreakdownPoint[];
    browsers: WebsiteTrafficBreakdownPoint[];
    operatingSystems: WebsiteTrafficBreakdownPoint[];
  };
};

export type WebsiteTrafficUnavailableReason =
  | "non-production"
  | "missing-configuration"
  | "plan-restriction"
  | "rate-limited"
  | "provider-unavailable";

export type WebsiteTrafficAnalyticsUnavailable = {
  status: "unavailable";
  reason: WebsiteTrafficUnavailableReason;
};

export type WebsiteTrafficAnalytics =
  | WebsiteTrafficAnalyticsAvailable
  | WebsiteTrafficAnalyticsUnavailable;

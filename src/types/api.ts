export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  notices?: string[];
}

export type AppRole = 'development' | 'collection' | 'admin';

export interface AuthenticatedRequest {
  appRole: AppRole;
}

// Batch submission request
export interface BatchListingRequest {
  listings: Record<string, unknown>[];
}

// URL check request
export interface CheckUrlsRequest {
  urls: string[];
}

// URL check response
export interface CheckUrlsResponse {
  existing_urls: string[];
}

// Pagination
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

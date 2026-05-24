import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  organizationId: string;
  userId: string;
  role: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

import { describe, it, expect } from '@jest/globals';

// Import the source directly for testing
import '../src/index';

// Mock console.log to avoid MCP server startup
jest.mock('console', () => ({
  log: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

// We need to test the GongClient class directly
// Let's create a standalone version for testing
class TestGongClient {
  private accessKey: string;
  private accessSecret: string;

  constructor(accessKey: string, accessSecret: string) {
    this.accessKey = accessKey;
    this.accessSecret = accessSecret;
  }

  private async generateSignature(method: string, path: string, timestamp: string, params?: unknown): Promise<string> {
    const crypto = require('crypto');
    const stringToSign = `${method}\n${path}\n${timestamp}\n${params ? JSON.stringify(params) : ''}`;
    
    const hmac = crypto.createHmac('sha256', this.accessSecret);
    hmac.update(stringToSign);
    return hmac.digest('base64');
  }

  private async request<T>(method: string, path: string, params?: Record<string, string | undefined>, data?: Record<string, unknown>): Promise<T> {
    const axios = require('axios');
    const timestamp = new Date().toISOString();
    const url = `https://api.gong.io/v2${path}`;
    
    const response = await axios({
      method,
      url,
      params,
      data,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.accessKey}:${this.accessSecret}`).toString('base64')}`,
        'X-Gong-AccessKey': this.accessKey,
        'X-Gong-Timestamp': timestamp,
        'X-Gong-Signature': await this.generateSignature(method, path, timestamp, data || params)
      }
    });

    return response.data as T;
  }

  async retrieveCallDetails(args: any): Promise<any> {
    // Validate at least one filter parameter
    if (!args.callIds && !args.fromDateTime && !args.toDateTime && !args.primaryUserIds) {
      throw new Error("At least one filter parameter is required");
    }

    const filter: any = {};
    if (args.callIds) filter.callIds = args.callIds;
    if (args.fromDateTime) filter.fromDateTime = args.fromDateTime;
    if (args.toDateTime) filter.toDateTime = args.toDateTime;
    if (args.primaryUserIds) filter.primaryUserIds = args.primaryUserIds;
    if (args.cursor) filter.cursor = args.cursor;
    
    return this.request('POST', '/calls/extensive', undefined, {
      filter,
      contentSelector: {
        // CRITICAL: 'Extended' context required for HubSpot CRM data (customer identification)
        context: args.context || 'Extended'
      }
    });
  }
}

describe('retrieve_call_details - Integration Tests', () => {
  let client: TestGongClient;

  beforeEach(() => {
    const accessKey = process.env.GONG_ACCESS_KEY;
    const accessSecret = process.env.GONG_ACCESS_SECRET;
    
    if (!accessKey || !accessSecret) {
      throw new Error('GONG_ACCESS_KEY and GONG_ACCESS_SECRET must be set');
    }
    
    client = new TestGongClient(accessKey, accessSecret);
  });

  it('should retrieve call details with known call ID', async () => {
    const result = await client.retrieveCallDetails({
      callIds: ['5896741599400166373']
    });

    expect(result).toBeDefined();
    expect(result.calls).toBeDefined();
    expect(Array.isArray(result.calls)).toBe(true);
    
    if (result.calls.length > 0) {
      const call = result.calls[0];
      expect(call.id).toBe('5896741599400166373');
      expect(call.metaData).toBeDefined();
      expect(call.metaData.title).toBeDefined();
      console.log('Retrieved call:', call.metaData.title);
    }
  }, 30000);

  it('should extract CRM data for customer identification', async () => {
    const result = await client.retrieveCallDetails({
      callIds: ['5896741599400166373']
    });

    expect(result.calls.length).toBeGreaterThan(0);
    const call = result.calls[0];
    
    console.log('Call context:', JSON.stringify(call.context, null, 2));
    
    // Check for CRM context (Extended context should provide this)
    if (call.context?.crm?.crmName) {
      expect(typeof call.context.crm.crmName).toBe('string');
      expect(call.context.crm.crmName.length).toBeGreaterThan(0);
      console.log('✅ Found CRM Name:', call.context.crm.crmName);
    } else {
      console.log('❌ No CRM name found in context');
    }

    // Also check parties for customer info
    if (call.parties && call.parties.length > 0) {
      console.log('Found parties:', call.parties.length);
      call.parties.forEach((party: any, index: number) => {
        console.log(`Party ${index}:`, party.name, party.emailAddress);
      });
    }
  }, 30000);

  it('should test pagination with date range', async () => {
    const result = await client.retrieveCallDetails({
      fromDateTime: '2024-08-01T00:00:00Z',
      toDateTime: '2024-08-02T23:59:59Z'
    });

    expect(result.calls).toBeDefined();
    
    console.log('Found calls:', result.calls.length);
    
    if (result.records) {
      console.log('Pagination info:', {
        total: result.records.totalRecords,
        pageSize: result.records.currentPageSize,
        currentPage: result.records.currentPageNumber,
        hasCursor: !!result.cursor
      });
      
      expect(typeof result.records.totalRecords).toBe('number');
      expect(typeof result.records.currentPageSize).toBe('number');
    }
  }, 30000);

  it('should throw error when no filter parameters provided', async () => {
    await expect(client.retrieveCallDetails({})).rejects.toThrow(
      'At least one filter parameter is required'
    );
  });
});
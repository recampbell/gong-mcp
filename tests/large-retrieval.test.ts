import { describe, it, expect } from '@jest/globals';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Same TestGongClient as before
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
        context: args.context || 'Extended'
      }
    });
  }

  async listCalls(fromDateTime?: string, toDateTime?: string): Promise<any> {
    const params: any = {};
    if (fromDateTime) params.fromDateTime = fromDateTime;
    if (toDateTime) params.toDateTime = toDateTime;

    return this.request('GET', '/calls', params);
  }
}

describe('Large Call Retrieval Tests', () => {
  let client: TestGongClient;

  beforeEach(() => {
    const accessKey = process.env.GONG_ACCESS_KEY;
    const accessSecret = process.env.GONG_ACCESS_SECRET;
    
    if (!accessKey || !accessSecret) {
      throw new Error('GONG_ACCESS_KEY and GONG_ACCESS_SECRET must be set');
    }
    
    client = new TestGongClient(accessKey, accessSecret);
  });

  it('should retrieve 100 call details efficiently', async () => {
    console.log('🚀 Starting large retrieval test...');
    
    // First get a list of calls to work with
    const callList = await client.listCalls('2024-08-01T00:00:00Z', '2024-08-31T23:59:59Z');
    console.log(`📞 Found ${callList.calls.length} calls available`);
    
    // Take up to 100 call IDs
    const callIds = callList.calls.slice(0, 100).map((call: any) => call.id);
    console.log(`🎯 Testing with ${callIds.length} call IDs`);

    const startTime = Date.now();
    
    try {
      const result = await client.retrieveCallDetails({
        callIds: callIds
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Successfully retrieved ${result.calls.length} call details in ${duration}ms`);
      console.log(`⚡ Average: ${(duration / result.calls.length).toFixed(2)}ms per call`);

      expect(result).toBeDefined();
      expect(result.calls).toBeDefined();
      expect(Array.isArray(result.calls)).toBe(true);
      expect(result.calls.length).toBeGreaterThan(0);
      expect(result.calls.length).toBeLessThanOrEqual(100);

      // Check if we got pagination info
      if (result.records) {
        console.log('📊 Pagination info:', {
          total: result.records.totalRecords,
          pageSize: result.records.currentPageSize,
          currentPage: result.records.currentPageNumber,
          hasCursor: !!result.cursor
        });
      }

      // Sample a few calls to check CRM data
      const sampleCalls = result.calls.slice(0, 5);
      let crmDataCount = 0;
      
      sampleCalls.forEach((call: any, index: number) => {
        console.log(`📋 Call ${index + 1}: ${call.metaData?.title || 'Unknown'}`);
        
        if (call.context && call.context.length > 0) {
          crmDataCount++;
          const crmContext = call.context[0];
          if (crmContext.objects && crmContext.objects.length > 0) {
            const accountObj = crmContext.objects.find((obj: any) => obj.objectType === 'Account');
            if (accountObj) {
              const nameField = accountObj.fields?.find((field: any) => field.name === 'name' || field.name === 'Name');
              if (nameField) {
                console.log(`  🏢 Customer: ${nameField.value}`);
              }
            }
          }
        }
      });

      console.log(`🎯 CRM data found in ${crmDataCount}/${sampleCalls.length} sampled calls`);

    } catch (error: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error(`❌ Failed after ${duration}ms:`, error.message);
      
      // Check if it's a rate limiting error
      if (error.response && error.response.status === 429) {
        console.log('🚦 Hit rate limit - this is expected with large requests');
        expect(error.response.status).toBe(429);
      } else {
        throw error;
      }
    }
  }, 120000); // 2 minute timeout for large request

  it('should test pagination workflow for large datasets', async () => {
    console.log('🔄 Testing pagination workflow...');
    
    const startTime = Date.now();
    let totalCalls = 0;
    let pageCount = 0;
    let cursor: string | undefined;

    try {
      do {
        pageCount++;
        console.log(`📄 Fetching page ${pageCount}${cursor ? ' with cursor' : ''}...`);

        const result = await client.retrieveCallDetails({
          fromDateTime: '2024-08-01T00:00:00Z',
          toDateTime: '2024-08-31T23:59:59Z',
          cursor: cursor
        });

        totalCalls += result.calls.length;
        cursor = result.cursor;

        console.log(`  📞 Page ${pageCount}: ${result.calls.length} calls`);
        
        if (result.records) {
          console.log(`  📊 Total available: ${result.records.totalRecords}`);
        }

        // Prevent infinite loops
        if (pageCount >= 5) {
          console.log('🛑 Stopping after 5 pages for test purposes');
          break;
        }

      } while (cursor);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Pagination test completed:`);
      console.log(`  📄 Pages fetched: ${pageCount}`);
      console.log(`  📞 Total calls retrieved: ${totalCalls}`);
      console.log(`  ⏱️  Total time: ${duration}ms`);
      console.log(`  ⚡ Average per page: ${(duration / pageCount).toFixed(2)}ms`);

      expect(totalCalls).toBeGreaterThan(0);
      expect(pageCount).toBeGreaterThan(0);

    } catch (error: any) {
      console.error('❌ Pagination test failed:', error.message);
      throw error;
    }
  }, 180000); // 3 minute timeout for pagination test
});
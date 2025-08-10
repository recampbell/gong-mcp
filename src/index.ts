#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Redirect all console output to stderr
const originalConsole = { ...console };
console.log = (...args) => originalConsole.error(...args);
console.info = (...args) => originalConsole.error(...args);
console.warn = (...args) => originalConsole.error(...args);

dotenv.config();

const GONG_API_URL = 'https://api.gong.io/v2';
const GONG_ACCESS_KEY = process.env.GONG_ACCESS_KEY;
const GONG_ACCESS_SECRET = process.env.GONG_ACCESS_SECRET;

// Check for required environment variables
if (!GONG_ACCESS_KEY || !GONG_ACCESS_SECRET) {
  console.error("Error: GONG_ACCESS_KEY and GONG_ACCESS_SECRET environment variables are required");
  process.exit(1);
}

// Type definitions
interface GongCall {
  id: string;
  title: string;
  scheduled?: string;
  started?: string;
  duration?: number;
  direction?: string;
  system?: string;
  scope?: string;
  media?: string;
  language?: string;
  url?: string;
}

interface GongTranscript {
  speakerId: string;
  topic?: string;
  sentences: Array<{
    start: number;
    text: string;
  }>;
}

interface GongListCallsResponse {
  calls: GongCall[];
}

interface GongRetrieveTranscriptsResponse {
  transcripts: GongTranscript[];
}

interface GongCallDetails {
  id: string;
  metaData: {
    id: string;
    url: string;
    title: string;
    scheduled?: string;
    started?: string;
    duration?: number;
    primaryUserId: string;
    direction?: string;
    system?: string;
    scope?: string;
    media?: string;
    language?: string;
    workspaceId: string;
  };
  content: {
    pointsOfInterest?: any[];
    topics?: any[];
    trackers?: any[];
    structure?: any;
    outline?: any[];
  };
  parties?: any[];
  collaboration?: any;
  interaction?: {
    speakers?: any[];
    personInteractionStats?: any[];
    questions?: any[];
    video?: any;
  };
  media?: {
    audioUrl?: string;
    videoUrl?: string;
    duration?: number;
  };
  context?: {
    crm?: {
      crmSystem?: string;
      crmId?: string;
      crmName?: string;
      crmUrl?: string;
    };
  };
}

interface GongRetrieveCallDetailsResponse {
  requestId?: string;
  records?: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
  };
  calls: GongCallDetails[];
  cursor?: string;
}

interface GongListCallsArgs {
  [key: string]: string | undefined;
  fromDateTime?: string;
  toDateTime?: string;
}

interface GongRetrieveTranscriptsArgs {
  callIds: string[];
}

interface GongRetrieveCallDetailsArgs {
  callIds?: string[];
  fromDateTime?: string;
  toDateTime?: string;
  primaryUserIds?: string[];
  context?: string;
  cursor?: string;
}

// Gong API Client
class GongClient {
  private accessKey: string;
  private accessSecret: string;

  constructor(accessKey: string, accessSecret: string) {
    this.accessKey = accessKey;
    this.accessSecret = accessSecret;
  }

  private async generateSignature(method: string, path: string, timestamp: string, params?: unknown): Promise<string> {
    const stringToSign = `${method}\n${path}\n${timestamp}\n${params ? JSON.stringify(params) : ''}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.accessSecret);
    const messageData = encoder.encode(stringToSign);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  private async request<T>(method: string, path: string, params?: Record<string, string | undefined>, data?: Record<string, unknown>): Promise<T> {
    const timestamp = new Date().toISOString();
    const url = `${GONG_API_URL}${path}`;
    
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

  async listCalls(fromDateTime?: string, toDateTime?: string): Promise<GongListCallsResponse> {
    const params: GongListCallsArgs = {};
    if (fromDateTime) params.fromDateTime = fromDateTime;
    if (toDateTime) params.toDateTime = toDateTime;

    return this.request<GongListCallsResponse>('GET', '/calls', params);
  }

  async retrieveTranscripts(callIds: string[]): Promise<GongRetrieveTranscriptsResponse> {
    return this.request<GongRetrieveTranscriptsResponse>('POST', '/calls/transcript', undefined, {
      filter: {
        callIds,
        includeEntities: true,
        includeInteractionsSummary: true,
        includeTrackers: true
      }
    });
  }

  async retrieveCallDetails(args: GongRetrieveCallDetailsArgs): Promise<GongRetrieveCallDetailsResponse> {
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
    
    return this.request<GongRetrieveCallDetailsResponse>('POST', '/calls/extensive', undefined, {
      filter,
      contentSelector: {
        // CRITICAL: 'Extended' context required for HubSpot CRM data (customer identification)
        context: args.context || 'Extended'
      }
    });
  }
}

const gongClient = new GongClient(GONG_ACCESS_KEY, GONG_ACCESS_SECRET);

// Tool definitions
const LIST_CALLS_TOOL: Tool = {
  name: "list_calls",
  description: "List Gong calls with optional date range filtering. Returns call details including ID, title, start/end times, participants, and duration.",
  inputSchema: {
    type: "object",
    properties: {
      fromDateTime: {
        type: "string",
        description: "Start date/time in ISO format (e.g. 2024-03-01T00:00:00Z)"
      },
      toDateTime: {
        type: "string",
        description: "End date/time in ISO format (e.g. 2024-03-31T23:59:59Z)"
      }
    }
  }
};

const RETRIEVE_TRANSCRIPTS_TOOL: Tool = {
  name: "retrieve_transcripts",
  description: "Retrieve transcripts for specified call IDs. Returns detailed transcripts including speaker IDs, topics, and timestamped sentences.",
  inputSchema: {
    type: "object",
    properties: {
      callIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of Gong call IDs to retrieve transcripts for"
      }
    },
    required: ["callIds"]
  }
};

const RETRIEVE_CALL_DETAILS_TOOL: Tool = {
  name: "retrieve_call_details",
  description: "Retrieve comprehensive call details including topics, trackers, speakers, interaction stats, and CRM data. Requires at least one filter parameter.",
  inputSchema: {
    type: "object",
    properties: {
      callIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of call IDs to retrieve"
      },
      fromDateTime: {
        type: "string",
        description: "Start date/time in ISO format (e.g., '2024-03-01T00:00:00Z')"
      },
      toDateTime: {
        type: "string",
        description: "End date/time in ISO format (e.g., '2024-03-31T23:59:59Z')"
      },
      primaryUserIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of primary user IDs to filter by"
      },
      context: {
        type: "string",
        description: "Context level for data retrieval (default: 'Extended' for CRM data)"
      },
      cursor: {
        type: "string",
        description: "Cursor for pagination"
      }
    }
  }
};

// Server implementation
const server = new Server(
  {
    name: "example-servers/gong",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Type guards
function isGongListCallsArgs(args: unknown): args is GongListCallsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    (!("fromDateTime" in args) || typeof (args as GongListCallsArgs).fromDateTime === "string") &&
    (!("toDateTime" in args) || typeof (args as GongListCallsArgs).toDateTime === "string")
  );
}

function isGongRetrieveTranscriptsArgs(args: unknown): args is GongRetrieveTranscriptsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "callIds" in args &&
    Array.isArray((args as GongRetrieveTranscriptsArgs).callIds) &&
    (args as GongRetrieveTranscriptsArgs).callIds.every(id => typeof id === "string")
  );
}

function isGongRetrieveCallDetailsArgs(args: unknown): args is GongRetrieveCallDetailsArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as GongRetrieveCallDetailsArgs;
  return (
    (!a.callIds || (Array.isArray(a.callIds) && a.callIds.every(id => typeof id === "string"))) &&
    (!a.fromDateTime || typeof a.fromDateTime === "string") &&
    (!a.toDateTime || typeof a.toDateTime === "string") &&
    (!a.primaryUserIds || (Array.isArray(a.primaryUserIds) && a.primaryUserIds.every(id => typeof id === "string"))) &&
    (!a.context || typeof a.context === "string") &&
    (!a.cursor || typeof a.cursor === "string")
  );
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [LIST_CALLS_TOOL, RETRIEVE_TRANSCRIPTS_TOOL, RETRIEVE_CALL_DETAILS_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments?: unknown } }) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "list_calls": {
        if (!isGongListCallsArgs(args)) {
          throw new Error("Invalid arguments for list_calls");
        }
        const { fromDateTime, toDateTime } = args;
        const response = await gongClient.listCalls(fromDateTime, toDateTime);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(response, null, 2)
          }],
          isError: false,
        };
      }

      case "retrieve_transcripts": {
        if (!isGongRetrieveTranscriptsArgs(args)) {
          throw new Error("Invalid arguments for retrieve_transcripts");
        }
        const { callIds } = args;
        const response = await gongClient.retrieveTranscripts(callIds);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(response, null, 2)
          }],
          isError: false,
        };
      }

      case "retrieve_call_details": {
        if (!isGongRetrieveCallDetailsArgs(args)) {
          throw new Error("Invalid arguments for retrieve_call_details");
        }
        const response = await gongClient.retrieveCallDetails(args);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(response, null, 2)
          }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
}); 
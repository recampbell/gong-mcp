# Gong MCP Server - Missing Tools Implementation Plan

## Current Status Analysis

### Implemented Tools ✅
- `list_calls` - List Gong calls with date filtering
- `retrieve_transcripts` - Get call transcripts with speaker data

### Missing Tools ❌
- `retrieve_call_details` - Comprehensive call analytics
- `list_users` - List all users with pagination
- `retrieve_user` - Get specific user details
- `list_users_by_filter` - Advanced user filtering

## Implementation Strategy

### Code Conventions Analysis
Based on the existing `src/index.ts`, we should maintain:

1. **Type Definitions**: Interface-first approach with comprehensive TypeScript types
2. **API Client Pattern**: Extend `GongClient` class with new methods
3. **Tool Definitions**: Follow existing `Tool` interface pattern
4. **Type Guards**: Runtime validation functions (`isXxxArgs`)
5. **Error Handling**: Consistent try-catch with structured error responses
6. **Authentication**: Reuse existing HMAC-SHA256 signature generation
7. **Response Format**: JSON string responses with `type: "text"`

### Gong API Endpoints Research

Based on Gong API documentation and step3 analysis:

#### 1. `retrieve_call_details` → `/calls/extensive`
- **Method**: POST
- **Authentication**: HMAC-SHA256 (existing pattern)
- **Parameters**: `callIds`, `fromDateTime`, `toDateTime`, `primaryUserIds`, `context`
- **Filter Requirements**: At least one filter parameter required
- **Critical**: Must set `contentSelector.context = 'Extended'` to get HubSpot CRM data for customer identification
- **Response**: Comprehensive call data with topics, trackers, interaction stats, and CRM context

#### 2. `list_users` → `/users`
- **Method**: GET  
- **Authentication**: Basic Auth (simpler than HMAC)
- **Parameters**: `cursor` (optional for pagination)
- **Response**: User list with pagination metadata

#### 3. `retrieve_user` → `/users/{userId}`
- **Method**: GET
- **Authentication**: Basic Auth
- **Parameters**: `userId` (path parameter)
- **Response**: Single user object

#### 4. `list_users_by_filter` → `/users/extensive`
- **Method**: POST
- **Authentication**: Basic Auth
- **Parameters**: `filter` object, `cursor` (optional)
- **Response**: Filtered user list with pagination

## Implementation Plan

### Phase 1: Type System Extension

**File**: `src/index.ts` (extend existing types)

```typescript
// New interfaces to add
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
    pointsOfInterest: any[];
    topics: any[];
    trackers: any[];
    structure: any;
    outline: any[];
  };
  parties: any[];
  collaboration: any;
  interaction: {
    speakers: any[];
    personInteractionStats: any[];
    questions: any[];
    video: any;
  };
  media: {
    audioUrl?: string;
    videoUrl?: string;
    duration?: number;
  };
}

interface GongUser {
  id: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  active: boolean;
  creationTime: string;
  emailAliases: string[];
  trustedEmailAddress: string;
  personalMeetingUrls: string[];
  managerId?: string;
  meetingConsentPageUrl?: string;
  spokenLanguages: Array<{
    language: string;
    primary: boolean;
  }>;
  settings: {
    scorecardPrivacy: string;
    telephonyCallRecording: boolean;
  };
}

interface GongUserFilter {
  emailAddresses?: string[];
  userIds?: string[];
  active?: boolean;
}

// Response interfaces
interface GongRetrieveCallDetailsResponse {
  calls: GongCallDetails[];
}

interface GongListUsersResponse {
  users: GongUser[];
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
  };
  cursor?: string;
}

interface GongRetrieveUserResponse {
  user: GongUser;
}

// Parameter interfaces
interface GongRetrieveCallDetailsArgs {
  callIds?: string[];
  fromDateTime?: string;
  toDateTime?: string;
  primaryUserIds?: string[];
  context?: string;
}

interface GongListUsersArgs {
  cursor?: string;
}

interface GongRetrieveUserArgs {
  userId: string;
}

interface GongListUsersByFilterArgs {
  filter: GongUserFilter;
  cursor?: string;
}
```

### Phase 2: GongClient Extension

**Add methods to `GongClient` class**:

```typescript
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
  
  return this.request<GongRetrieveCallDetailsResponse>('POST', '/calls/extensive', undefined, {
    filter,
    contentSelector: {
      // CRITICAL: 'Extended' context required for HubSpot CRM data (customer identification)
      context: args.context || 'Extended'
    }
  });
}

async listUsers(cursor?: string): Promise<GongListUsersResponse> {
  const params: any = {};
  if (cursor) params.cursor = cursor;
  
  return this.request<GongListUsersResponse>('GET', '/users', params);
}

async retrieveUser(userId: string): Promise<GongRetrieveUserResponse> {
  return this.request<GongRetrieveUserResponse>('GET', `/users/${userId}`);
}

async listUsersByFilter(filter: GongUserFilter, cursor?: string): Promise<GongListUsersResponse> {
  const data: any = { filter };
  if (cursor) data.cursor = cursor;
  
  return this.request<GongListUsersResponse>('POST', '/users/extensive', undefined, data);
}
```

### Phase 3: Tool Definitions

**Add to tools array**:

```typescript
const RETRIEVE_CALL_DETAILS_TOOL: Tool = {
  name: "retrieve_call_details",
  description: "Retrieve comprehensive call details including topics, trackers, speakers, and interaction stats",
  inputSchema: {
    type: "object",
    properties: {
      callIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of call IDs"
      },
      fromDateTime: {
        type: "string",
        description: "Start date/time in ISO format"
      },
      toDateTime: {
        type: "string", 
        description: "End date/time in ISO format"
      },
      primaryUserIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of primary user IDs"
      },
      context: {
        type: "string",
        description: "Context level (default: Extended)"
      }
    }
  }
};

const LIST_USERS_TOOL: Tool = {
  name: "list_users",
  description: "List all Gong users with optional pagination",
  inputSchema: {
    type: "object",
    properties: {
      cursor: {
        type: "string",
        description: "Cursor for pagination"
      }
    }
  }
};

const RETRIEVE_USER_TOOL: Tool = {
  name: "retrieve_user",
  description: "Retrieve detailed information for a specific user",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "The unique ID of the user to retrieve"
      }
    },
    required: ["userId"]
  }
};

const LIST_USERS_BY_FILTER_TOOL: Tool = {
  name: "list_users_by_filter",
  description: "List users based on filter criteria",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "object",
        properties: {
          emailAddresses: {
            type: "array",
            items: { type: "string" },
            description: "Array of email addresses"
          },
          userIds: {
            type: "array", 
            items: { type: "string" },
            description: "Array of user IDs"
          },
          active: {
            type: "boolean",
            description: "Filter by active status"
          }
        }
      },
      cursor: {
        type: "string",
        description: "Cursor for pagination"
      }
    },
    required: ["filter"]
  }
};
```

### Phase 4: Type Guards

```typescript
function isGongRetrieveCallDetailsArgs(args: unknown): args is GongRetrieveCallDetailsArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as GongRetrieveCallDetailsArgs;
  return (
    (!a.callIds || (Array.isArray(a.callIds) && a.callIds.every(id => typeof id === "string"))) &&
    (!a.fromDateTime || typeof a.fromDateTime === "string") &&
    (!a.toDateTime || typeof a.toDateTime === "string") &&
    (!a.primaryUserIds || (Array.isArray(a.primaryUserIds) && a.primaryUserIds.every(id => typeof id === "string"))) &&
    (!a.context || typeof a.context === "string")
  );
}

function isGongListUsersArgs(args: unknown): args is GongListUsersArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as GongListUsersArgs;
  return (!a.cursor || typeof a.cursor === "string");
}

function isGongRetrieveUserArgs(args: unknown): args is GongRetrieveUserArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "userId" in args &&
    typeof (args as GongRetrieveUserArgs).userId === "string"
  );
}

function isGongListUsersByFilterArgs(args: unknown): args is GongListUsersByFilterArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as GongListUsersByFilterArgs;
  return (
    typeof a.filter === "object" &&
    a.filter !== null &&
    (!a.cursor || typeof a.cursor === "string")
  );
}
```

### Phase 5: Request Handlers

**Add cases to existing switch statement**:

```typescript
case "retrieve_call_details": {
  if (!isGongRetrieveCallDetailsArgs(args)) {
    throw new Error("Invalid arguments for retrieve_call_details");
  }
  const response = await gongClient.retrieveCallDetails(args);
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    isError: false,
  };
}

// Similar patterns for other tools...
```

## Testing Strategy

### Test Infrastructure Setup

1. **Install Testing Dependencies**:
   ```bash
   npm install --save-dev jest @types/jest ts-jest
   ```

2. **Jest Configuration** (`jest.config.js`):
   ```javascript
   export default {
     preset: 'ts-jest/presets/default-esm',
     extensionsToTreatAsEsm: ['.ts'],
     globals: {
       'ts-jest': {
         useESM: true
       }
     },
     testEnvironment: 'node',
     testMatch: ['**/tests/**/*.test.ts'],
     collectCoverageFrom: [
       'src/**/*.ts',
       '!src/**/*.d.ts',
     ]
   };
   ```

3. **Directory Structure**:
   ```
   temp-gong-mcp/
   ├── tests/
   │   ├── mcp-test-helper.ts          # Test utilities
   │   ├── retrieve-call-details.test.ts
   │   ├── list-users.test.ts  
   │   ├── retrieve-user.test.ts
   │   ├── list-users-by-filter.test.ts
   │   └── integration.test.ts         # Full workflow tests
   ```

### Test Implementation Approach

#### Unit Tests
- **Mock API Responses**: Use Jest mocks to simulate Gong API responses
- **Type Validation**: Test type guards with valid/invalid inputs
- **Error Handling**: Test error scenarios and edge cases
- **Parameter Validation**: Test required parameter enforcement

#### Integration Tests  
- **Real API Calls**: Optional tests with actual Gong API (when credentials available)
- **MCP Protocol**: Test MCP tool registration and invocation
- **End-to-End Workflows**: Test complete analysis workflows

#### Test Helper Utilities
```typescript
// tests/mcp-test-helper.ts
export const mockGongApiResponses = {
  retrieveCallDetails: { /* sample response */ },
  listUsers: { /* sample response */ },
  // ... other mocks
};

export function createMockGongClient() {
  // Return mock client for unit testing
}

export function setupTestEnvironment() {
  // Setup test environment variables
}
```

### Testing Checklist

#### For Each New Tool:
- [ ] Type definitions compile without errors
- [ ] Type guards correctly validate parameters  
- [ ] API client method handles requests properly
- [ ] Tool definition schema is valid
- [ ] Request handler processes arguments correctly
- [ ] Error cases return structured responses
- [ ] Success cases return expected JSON format
- [ ] Integration with MCP protocol works
- [ ] Real API calls work (when credentials available)

## Implementation Priority

### Sprint 1: Core Infrastructure
1. ✅ Set up testing infrastructure
2. ✅ Add type definitions
3. ✅ Extend GongClient class  
4. ✅ Update package.json scripts

### Sprint 2: Tool Implementation  
1. ✅ Implement `retrieve_call_details`
2. ✅ Implement `list_users`  
3. ✅ Add comprehensive tests for both
4. ✅ Validate with real API calls

### Sprint 3: User Management Tools
1. ✅ Implement `retrieve_user`
2. ✅ Implement `list_users_by_filter`
3. ✅ Add comprehensive tests
4. ✅ Integration testing

### Sprint 4: Quality & Documentation
1. ✅ Full test suite coverage
2. ✅ Error handling validation
3. ✅ Documentation updates
4. ✅ Performance testing

## File Modification Plan

### Files to Modify
1. **`src/index.ts`** - Add all new functionality (following existing patterns)
2. **`package.json`** - Add test scripts and Jest dependencies
3. **`tsconfig.json`** - Ensure test directory is included
4. **`README.md`** - Update with new tool documentation

### New Files to Create
1. **`jest.config.js`** - Jest configuration
2. **`tests/`** - Test directory with all test files
3. **`IMPLEMENTATION_PLAN.md`** - This file

## Risk Mitigation

### API Rate Limiting
- Implement retry logic with exponential backoff
- Add request throttling for test suites
- Document rate limit handling in tool descriptions

### Authentication Issues
- Validate different auth methods (Basic vs HMAC)
- Test with invalid credentials 
- Provide clear error messages

### Data Volume
- Implement pagination correctly
- Test with large result sets
- Add response size warnings

### Breaking Changes
- Maintain backward compatibility
- Version new tool additions
- Test existing tools remain functional

## Success Criteria

- [ ] All 4 missing tools implemented and tested
- [ ] 100% test coverage for new code
- [ ] Integration with existing tools maintained
- [ ] Real API validation passes
- [ ] Documentation updated
- [ ] Performance benchmarks met
- [ ] Error handling comprehensive
- [ ] MCP protocol compliance verified

## Timeline Estimate

- **Sprint 1**: 1-2 days (Infrastructure + Types)
- **Sprint 2**: 2-3 days (First 2 tools + tests)
- **Sprint 3**: 2-3 days (Remaining 2 tools + tests) 
- **Sprint 4**: 1-2 days (Quality + docs)

**Total**: 6-10 days for complete implementation and testing

---

**Created**: 2025-08-10
**Status**: Ready for Implementation
**Next Action**: Execute Sprint 1 setup tasks
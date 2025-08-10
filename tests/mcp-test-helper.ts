import axios from 'axios';
import { jest } from '@jest/globals';

// Mock Gong API responses
export const mockGongApiResponses = {
  retrieveCallDetails: {
    requestId: "test-request-123",
    records: {
      totalRecords: 2,
      currentPageSize: 2,
      currentPageNumber: 0
    },
    calls: [
      {
        id: "5896741599400166373",
        metaData: {
          id: "5896741599400166373",
          url: "https://us-58843.app.gong.io/call?id=5896741599400166373",
          title: "Zions-Liquibase-Account-Manager-Intro-+-Renewal-Kickoff",
          scheduled: "2024-08-01T14:00:00Z",
          started: "2024-08-01T14:02:15Z",
          duration: 2847,
          primaryUserId: "8325826523113452338",
          direction: "Conference",
          system: "Zoom",
          scope: "External",
          media: "Video",
          language: "eng",
          workspaceId: "5389534272249628364"
        },
        content: {
          pointsOfInterest: [],
          topics: [
            {
              name: "Account Management",
              duration: 1200000,
              keyMoments: []
            }
          ],
          trackers: [],
          structure: {},
          outline: []
        },
        parties: [
          {
            id: "party-1",
            emailAddress: "john.doe@zionsbank.com",
            name: "John Doe",
            title: "Database Administrator"
          }
        ],
        collaboration: {},
        interaction: {
          speakers: [
            {
              id: "speaker-001",
              userId: "8325826523113452338",
              name: "Account Manager"
            }
          ],
          personInteractionStats: [],
          questions: [],
          video: {}
        },
        media: {
          duration: 2847
        },
        context: {
          crm: {
            crmSystem: "HubSpot",
            crmId: "hubspot-12345",
            crmName: "Zions Bank",
            crmUrl: "https://app.hubspot.com/contacts/12345/company/67890"
          }
        }
      },
      {
        id: "1234567890123456789",
        metaData: {
          id: "1234567890123456789",
          url: "https://us-58843.app.gong.io/call?id=1234567890123456789",
          title: "Sales Discovery Call - Acme Corp",
          scheduled: "2024-08-02T10:00:00Z",
          started: "2024-08-02T10:00:45Z",
          duration: 1823,
          primaryUserId: "2758826294103739468",
          direction: "Conference",
          system: "Teams",
          scope: "External",
          media: "Audio",
          language: "eng",
          workspaceId: "5389534272249628364"
        },
        content: {
          pointsOfInterest: [],
          topics: [
            {
              name: "Sales Discovery",
              duration: 900000,
              keyMoments: []
            }
          ],
          trackers: [],
          structure: {},
          outline: []
        },
        parties: [
          {
            id: "party-2",
            emailAddress: "jane.smith@acme.com",
            name: "Jane Smith",
            title: "CTO"
          }
        ],
        collaboration: {},
        interaction: {
          speakers: [
            {
              id: "speaker-002",
              userId: "2758826294103739468",
              name: "Sales Rep"
            }
          ],
          personInteractionStats: [],
          questions: [],
          video: {}
        },
        media: {
          duration: 1823
        },
        context: {
          crm: {
            crmSystem: "HubSpot",
            crmId: "hubspot-54321",
            crmName: "Acme Corporation",
            crmUrl: "https://app.hubspot.com/contacts/12345/company/98765"
          }
        }
      }
    ]
  },
  
  retrieveCallDetailsPaginated: {
    requestId: "test-request-456",
    records: {
      totalRecords: 5,
      currentPageSize: 2,
      currentPageNumber: 0
    },
    calls: [
      {
        id: "call-page-1-item-1",
        metaData: {
          id: "call-page-1-item-1",
          url: "https://us-58843.app.gong.io/call?id=call-page-1-item-1",
          title: "Page 1 Call 1",
          scheduled: "2024-08-01T09:00:00Z",
          started: "2024-08-01T09:00:30Z",
          duration: 1500,
          primaryUserId: "user-123",
          direction: "Conference",
          system: "Zoom",
          scope: "External",
          media: "Video",
          language: "eng",
          workspaceId: "workspace-123"
        },
        content: {
          topics: [],
          trackers: [],
        },
        context: {
          crm: {
            crmSystem: "HubSpot",
            crmName: "Customer A"
          }
        }
      },
      {
        id: "call-page-1-item-2", 
        metaData: {
          id: "call-page-1-item-2",
          url: "https://us-58843.app.gong.io/call?id=call-page-1-item-2",
          title: "Page 1 Call 2",
          scheduled: "2024-08-01T10:00:00Z",
          started: "2024-08-01T10:01:00Z",
          duration: 1800,
          primaryUserId: "user-456",
          direction: "Conference", 
          system: "Teams",
          scope: "External",
          media: "Video",
          language: "eng",
          workspaceId: "workspace-123"
        },
        content: {
          topics: [],
          trackers: [],
        },
        context: {
          crm: {
            crmSystem: "HubSpot",
            crmName: "Customer B"
          }
        }
      }
    ],
    cursor: "next-page-cursor-abc123"
  }
};

export function setupTestEnvironment() {
  process.env.GONG_ACCESS_KEY = 'test-access-key';
  process.env.GONG_ACCESS_SECRET = 'test-access-secret';
}

export function createMockAxiosResponse(data: any, status = 200) {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {}
  };
}

export function mockAxiosRequest() {
  return jest.fn().mockImplementation((config: any) => {
    const { method, url, data } = config;
    
    // Mock /calls/extensive endpoint
    if (method === 'POST' && url.includes('/calls/extensive')) {
      const requestData = data;
      
      // Check if this is a pagination request
      if (requestData?.filter?.cursor === 'next-page-cursor-abc123') {
        return Promise.resolve(createMockAxiosResponse({
          ...mockGongApiResponses.retrieveCallDetailsPaginated,
          calls: [
            {
              id: "call-page-2-item-1",
              metaData: {
                id: "call-page-2-item-1",
                title: "Page 2 Call 1",
                primaryUserId: "user-789"
              },
              context: {
                crm: {
                  crmSystem: "HubSpot",
                  crmName: "Customer C"
                }
              }
            }
          ],
          cursor: undefined // Last page
        }));
      }
      
      // Check if requesting specific call IDs
      if (requestData?.filter?.callIds) {
        return Promise.resolve(createMockAxiosResponse(mockGongApiResponses.retrieveCallDetails));
      }
      
      // Default pagination response
      return Promise.resolve(createMockAxiosResponse(mockGongApiResponses.retrieveCallDetailsPaginated));
    }
    
    return Promise.reject(new Error(`Unmocked API call: ${method} ${url}`));
  });
}
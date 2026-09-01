export const swaggerDocument = {
  openapi: "3.0.3",

  info: {
    title: "FlowLens API",
    version: "1.0.0",
    description:
      "AI-powered developer productivity and code intelligence API. FlowLens connects to GitHub, analyzes repository activity, and generates AI-powered developer insights.",
    contact: {
      name: "FlowLens",
    },
  },

  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development server",
    },
  ],

  tags: [
    {
      name: "Health",
      description: "API health and status",
    },
    {
      name: "Auth",
      description: "Authentication and user profile",
    },
    {
      name: "Dashboard",
      description: "Aggregated developer dashboard data",
    },
    {
      name: "Repos",
      description: "GitHub repository operations",
    },
    {
      name: "Analysis",
      description: "AI-powered developer and repository analysis",
    },
    {
      name: "Chat",
      description: "Ask FlowLens questions about development activity",
    },
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token returned after successful authentication.",
      },
    },

    parameters: {
      OwnerParam: {
        name: "owner",
        in: "path",
        required: true,
        description: "GitHub repository owner.",
        schema: {
          type: "string",
        },
        example: "oluordiah",
      },

      RepoParam: {
        name: "repo",
        in: "path",
        required: true,
        description: "GitHub repository name.",
        schema: {
          type: "string",
        },
        example: "flowlens",
      },
    },

    schemas: {
      User: {
        type: "object",
        required: ["_id", "githubId", "username", "createdAt", "updatedAt"],
        properties: {
          _id: {
            type: "string",
            example: "66d1234567890abcdef1234",
          },

          githubId: {
            type: "string",
            example: "123456789",
            description: "GitHub user ID.",
          },

          username: {
            type: "string",
            example: "oluordiah",
          },

          displayName: {
            type: "string",
            nullable: true,
            example: "Olu Ordiah",
          },

          avatarUrl: {
            type: "string",
            format: "uri",
            nullable: true,
            example: "https://avatars.githubusercontent.com/u/123456",
          },

          profileUrl: {
            type: "string",
            format: "uri",
            nullable: true,
            example: "https://github.com/oluordiah",
          },

          createdAt: {
            type: "string",
            format: "date-time",
          },

          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },

      Repo: {
        type: "object",
        properties: {
          id: {
            type: "string",
            example: "123456789",
          },

          full_name: {
            type: "string",
            example: "oluordiah/flowlens",
          },

          name: {
            type: "string",
            example: "flowlens",
          },

          owner: {
            type: "string",
            example: "oluordiah",
          },

          description: {
            type: "string",
            nullable: true,
            example: "AI-powered developer intelligence platform.",
          },

          language: {
            type: "string",
            nullable: true,
            example: "TypeScript",
          },

          stars: {
            type: "integer",
            format: "int32",
            example: 24,
          },

          forks: {
            type: "integer",
            format: "int32",
            example: 8,
          },

          openIssues: {
            type: "integer",
            format: "int32",
            example: 5,
          },

          defaultBranch: {
            type: "string",
            example: "main",
          },

          private: {
            type: "boolean",
            example: false,
          },

          htmlUrl: {
            type: "string",
            format: "uri",
            example: "https://github.com/oluordiah/flowlens",
          },

          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },

      RepoStats: {
        type: "object",
        required: [
          "commits",
          "pullRequests",
          "issues",
          "contributors",
          "languages",
          "weeklyActivity",
          "stars",
          "forks",
          "openIssues",
        ],
        properties: {
          commits: {
            type: "integer",
            example: 127,
          },

          pullRequests: {
            type: "integer",
            example: 18,
          },

          issues: {
            type: "integer",
            example: 32,
          },

          contributors: {
            type: "integer",
            example: 7,
          },

          languages: {
            type: "object",
            additionalProperties: {
              type: "number",
              format: "float",
            },
            example: {
              JavaScript: 48,
              Java: 31,
              TypeScript: 12,
              CSS: 6,
              Other: 3,
            },
          },

          weeklyActivity: {
            type: "array",
            description:
              "Commit activity for the last 6 weeks, ordered from oldest to newest.",
            items: {
              type: "integer",
            },
            minItems: 6,
            maxItems: 6,
            example: [18, 25, 21, 34, 29, 31],
          },

          stars: {
            type: "integer",
            example: 24,
          },

          forks: {
            type: "integer",
            example: 8,
          },

          openIssues: {
            type: "integer",
            example: 5,
          },
        },
      },

      DeveloperScores: {
        type: "object",
        required: ["consistency", "codeQuality", "collaboration", "projectActivity", "overall"],
        properties: {
          consistency: {
            type: "number",
            minimum: 0,
            maximum: 100,
            example: 82,
          },

          codeQuality: {
            type: "number",
            minimum: 0,
            maximum: 100,
            example: 76,
          },

          collaboration: {
            type: "number",
            minimum: 0,
            maximum: 100,
            example: 91,
          },

          projectActivity: {
            type: "number",
            minimum: 0,
            maximum: 100,
            example: 88,
          },

          overall: {
            type: "number",
            minimum: 0,
            maximum: 100,
            example: 84,
          },
        },
      },

      DeveloperReport: {
        type: "object",
        required: ["scores", "strengths", "improvements", "summary"],
        properties: {
          scores: {
            $ref: "#/components/schemas/DeveloperScores",
          },

          strengths: {
            type: "array",
            items: {
              type: "string",
            },
            example: [
              "Strong development consistency",
              "Good collaboration activity",
              "Healthy repository activity",
            ],
          },

          improvements: {
            type: "array",
            items: {
              type: "string",
            },
            example: [
              "Improve code quality",
              "Break larger changes into smaller commits",
            ],
          },

          summary: {
            type: "string",
            example:
              "Your development activity shows strong consistency with increasing collaboration and project activity.",
          },
        },
      },

      DashboardSummary: {
        type: "object",
        properties: {
          developer: {
            $ref: "#/components/schemas/User",
          },

          selectedRepository: {
            allOf: [
              {
                $ref: "#/components/schemas/Repo",
              },
            ],
            nullable: true,
          },

          stats: {
            allOf: [
              {
                $ref: "#/components/schemas/RepoStats",
              },
            ],
            nullable: true,
          },

          report: {
            allOf: [
              {
                $ref: "#/components/schemas/DeveloperReport",
              },
            ],
            nullable: true,
          },

          reportCreatedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
        },
      },

      ChatMessage: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: {
            type: "string",
            enum: ["user", "assistant"],
          },

          content: {
            type: "string",
          },
        },
      },

      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "string",
            example: "Unauthorized",
          },

          message: {
            type: "string",
            nullable: true,
            example: "A valid authentication token is required.",
          },

          statusCode: {
            type: "integer",
            nullable: true,
            example: 401,
          },
        },
      },
    },
  },

  paths: {
    "/": {
      get: {
        summary: "Health check",
        tags: ["Health"],
        responses: {
          "200": {
            description: "API is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      example: "FlowLens API",
                    },
                    status: {
                      type: "string",
                      example: "ok",
                    },
                    timestamp: {
                      type: "string",
                      format: "date-time",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/github/start": {
      get: {
        summary: "Start GitHub OAuth flow",
        description: "Redirects the user to GitHub's OAuth authorization page.",
        tags: ["Auth"],
        responses: {
          "302": {
            description: "Redirect to GitHub authorization page",
          },
        },
      },
    },

    "/api/auth/github/callback": {
      get: {
        summary: "GitHub OAuth callback",
        description:
          "Handles the OAuth callback, exchanges the authorization code for a GitHub access token, creates or updates the user, and establishes application authentication.",
        tags: ["Auth"],
        parameters: [
          {
            name: "code",
            in: "query",
            required: false,
            schema: {
              type: "string",
            },
            description: "Authorization code returned by GitHub.",
          },

          {
            name: "error",
            in: "query",
            required: false,
            schema: {
              type: "string",
            },
            description: "OAuth error returned if the user denies authorization.",
          },
        ],
        responses: {
          "302": {
            description: "Redirect to the frontend.",
          },

          "400": {
            description: "Invalid OAuth callback.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "500": {
            description: "GitHub authentication failed.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/me": {
      get: {
        summary: "Get current authenticated user",
        tags: ["Auth"],
        security: [
          {
            bearerAuth: [],
          },
        ],
        responses: {
          "200": {
            description: "Authenticated user profile",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User",
                },
              },
            },
          },

          "401": {
            description: "Authentication required.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/dashboard": {
      get: {
        summary: "Get dashboard summary",
        description:
          "Returns aggregated dashboard information for the authenticated user. If no repository is specified, the most recently updated repository is used automatically.",
        tags: ["Dashboard"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            name: "owner",
            in: "query",
            required: false,
            schema: {
              type: "string",
            },
            example: "oluordiah",
          },

          {
            name: "repo",
            in: "query",
            required: false,
            schema: {
              type: "string",
            },
            example: "flowlens",
          },
        ],

        responses: {
          "200": {
            description: "Dashboard summary",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DashboardSummary",
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/repos": {
      get: {
        summary: "List authenticated user's repositories",
        tags: ["Repos"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            name: "page",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1,
            },
          },

          {
            name: "perPage",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 30,
            },
          },

          {
            name: "search",
            in: "query",
            required: false,
            schema: {
              type: "string",
            },
          },
        ],

        responses: {
          "200": {
            description: "List of repositories",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    repos: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Repo",
                      },
                    },

                    pagination: {
                      type: "object",
                      properties: {
                        page: {
                          type: "integer",
                        },

                        perPage: {
                          type: "integer",
                        },

                        total: {
                          type: "integer",
                        },

                        hasNextPage: {
                          type: "boolean",
                        },
                      },
                    },
                  },
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/repos/{owner}/{repo}": {
      get: {
        summary: "Get repository details",
        tags: ["Repos"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            $ref: "#/components/parameters/OwnerParam",
          },

          {
            $ref: "#/components/parameters/RepoParam",
          },
        ],

        responses: {
          "200": {
            description: "Repository details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Repo",
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "404": {
            description: "Repository not found.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/repos/{owner}/{repo}/stats": {
      get: {
        summary: "Get repository statistics",
        description:
          "Returns repository metrics including commits, pull requests, issues, contributors, language distribution, GitHub stars, forks, open issues, and six weeks of commit activity.",
        tags: ["Repos"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            $ref: "#/components/parameters/OwnerParam",
          },

          {
            $ref: "#/components/parameters/RepoParam",
          },
        ],

        responses: {
          "200": {
            description: "Repository statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    stats: {
                      $ref: "#/components/schemas/RepoStats",
                    },
                  },
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "404": {
            description: "Repository not found.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/analysis/{owner}/{repo}": {
      get: {
        summary: "Get cached AI analysis",
        description:
          "Returns the latest cached AI-generated developer report for the specified repository.",
        tags: ["Analysis"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            $ref: "#/components/parameters/OwnerParam",
          },

          {
            $ref: "#/components/parameters/RepoParam",
          },
        ],

        responses: {
          "200": {
            description: "Cached AI report",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    report: {
                      $ref: "#/components/schemas/DeveloperReport",
                    },

                    repoStats: {
                      $ref: "#/components/schemas/RepoStats",
                    },

                    createdAt: {
                      type: "string",
                      format: "date-time",
                    },
                  },
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "404": {
            description: "No cached analysis exists.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },

      post: {
        summary: "Generate AI developer report",
        description:
          "Fetches repository statistics, sends structured developer data to the configured AI model, validates the response, and stores the generated report in MongoDB.",
        tags: ["Analysis"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        parameters: [
          {
            $ref: "#/components/parameters/OwnerParam",
          },

          {
            $ref: "#/components/parameters/RepoParam",
          },
        ],

        responses: {
          "200": {
            description: "AI report generated successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    report: {
                      $ref: "#/components/schemas/DeveloperReport",
                    },

                    repoStats: {
                      $ref: "#/components/schemas/RepoStats",
                    },

                    cached: {
                      type: "boolean",
                      example: false,
                    },
                  },
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "404": {
            description: "Repository not found.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "500": {
            description: "Failed to generate AI analysis.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },

    "/api/chat": {
      post: {
        summary: "Ask FlowLens a question",
        description:
          "Sends a natural-language question to FlowLens. The response can be grounded in the authenticated user's repository statistics and optional conversation history.",
        tags: ["Chat"],
        security: [
          {
            bearerAuth: [],
          },
        ],

        requestBody: {
          required: true,

          content: {
            "application/json": {
              schema: {
                type: "object",

                required: ["message"],

                properties: {
                  message: {
                    type: "string",
                    minLength: 1,
                    maxLength: 5000,
                    example: "What should I focus on this week?",
                  },

                  owner: {
                    type: "string",
                    example: "oluordiah",
                  },

                  repo: {
                    type: "string",
                    example: "flowlens",
                  },

                  history: {
                    type: "array",
                    maxItems: 20,
                    items: {
                      $ref: "#/components/schemas/ChatMessage",
                    },
                  },
                },
              },
            },
          },
        },

        responses: {
          "200": {
            description: "AI-generated answer",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["answer"],
                  properties: {
                    answer: {
                      type: "string",
                      example:
                        "Based on your recent activity, focus on improving test coverage and breaking larger commits into smaller changes.",
                    },
                  },
                },
              },
            },
          },

          "400": {
            description: "Invalid request.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "401": {
            description: "Unauthorized.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },

          "500": {
            description: "AI request failed.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error",
                },
              },
            },
          },
        },
      },
    },
  },
};

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
    {
      name: "Card",
      description: "Public, opt-in shareable score cards",
    },
    {
      name: "Profile",
      description: "Profile Builder: saved profile configuration and GitHub contribution calendar",
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

      ToneParam: {
        name: "tone",
        in: "query",
        required: false,
        description: "Narrative style. Scores are identical across tones; only the text changes.",
        schema: { type: "string", enum: ["mentor", "roast", "hype"], default: "mentor" },
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
            minItems: 2,
            maxItems: 2,
            example: [18, 25],
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
        description:
          "Computed deterministically from GitHub stats (not by the LLM), so re-running an analysis on the same data yields the same scores.",
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

          breakdown: {
            type: "object",
            description: "Human-readable explanation of how each score was computed from the raw stats.",
            additionalProperties: { type: "string" },
            example: {
              consistency: "Commits in 5 of the last 6 weeks (4 → 0 → 6 → 9 → 11 → 7 per week).",
              collaboration: "1 contributor, 0 recent PRs, 1 recent issue.",
            },
          },

          headline: {
            type: "string",
            description: "One-line verdict used on the shareable card.",
            example: "Two steady weeks of commits — now let someone else review them.",
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
    "/api/profile": {
      get: {
        summary: "Get the saved Profile Builder configuration",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Saved profile, or { profile: null } when none is saved." },
          "401": { description: "Unauthorized." },
        },
      },
      put: {
        summary: "Save (create or replace) the Profile Builder configuration",
        description:
          "Text fields are length-limited, links must be http(s) or mailto URLs. Only generated ASCII text is stored for portraits; photos are never uploaded.",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { profile: { type: "object" } } } } },
        },
        responses: {
          "200": { description: "Saved profile." },
          "400": { description: "Validation error.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized." },
        },
      },
      delete: {
        summary: "Delete the saved Profile Builder configuration",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        responses: { "204": { description: "Deleted." }, "401": { description: "Unauthorized." } },
      },
    },

    "/api/profile/contributions": {
      get: {
        summary: "Get the signed-in user's GitHub contribution calendar (last year)",
        description:
          "Real data from GitHub's GraphQL contributionCalendar, cached per user for 15 minutes. Returns daily totals only.",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Contribution calendar." },
          "401": { description: "Unauthorized or GitHub token revoked." },
          "429": { description: "GitHub rate limit reached." },
          "502": { description: "GitHub did not return contribution data." },
        },
      },
    },
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

          {
            $ref: "#/components/parameters/ToneParam",
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
          "Fetches repository statistics, computes the scores deterministically, asks the AI model to write the narrative (strengths, improvements, summary) in the requested tone, and stores the report. Returns the cached report unless refresh=true. If the AI provider fails, a template narrative is used so the request still succeeds.",
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

          {
            $ref: "#/components/parameters/ToneParam",
          },

          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Ignore the cached report and generate a new one.",
            schema: { type: "boolean", default: false },
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

    "/api/analysis/{owner}/{repo}/share": {
      post: {
        summary: "Share an analysis publicly",
        description:
          "Opt-in: gives the latest analysis for this repo (and tone) an unguessable public slug. Returns the public card URLs.",
        tags: ["Analysis", "Card"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/OwnerParam" },
          { $ref: "#/components/parameters/RepoParam" },
          { $ref: "#/components/parameters/ToneParam" },
        ],
        responses: {
          "200": {
            description: "Share links",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    slug: { type: "string", example: "q3Zk_P1x" },
                    cardUrl: { type: "string", example: "https://flowlens.app/card/q3Zk_P1x" },
                    apiUrl: { type: "string" },
                    imageUrl: { type: "string", example: "https://api.flowlens.app/api/card/q3Zk_P1x/image.svg" },
                  },
                },
              },
            },
          },
          "404": {
            description: "No analysis to share yet.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        summary: "Stop sharing",
        description: "Removes the public slug from every analysis of this repo.",
        tags: ["Analysis", "Card"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/OwnerParam" },
          { $ref: "#/components/parameters/RepoParam" },
        ],
        responses: { "200": { description: "Unshared" } },
      },
    },

    "/api/card/{slug}": {
      get: {
        summary: "Get a public score card (JSON)",
        tags: ["Card"],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Card data for the shared analysis." },
          "404": {
            description: "Not found or no longer shared.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/card/{slug}/image.svg": {
      get: {
        summary: "Get a public score card (SVG image)",
        description:
          "Embeddable image, e.g. in a GitHub README: ![FlowLens](https://<api>/api/card/<slug>/image.svg)",
        tags: ["Card"],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "SVG card", content: { "image/svg+xml": {} } },
          "404": { description: "Not found or no longer shared." },
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

                  tone: {
                    type: "string",
                    enum: ["mentor", "roast", "hype"],
                    default: "mentor",
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

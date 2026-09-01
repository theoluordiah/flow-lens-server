import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  mongoUri: process.env.MONGODB_URI || "",
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    callbackUrl: process.env.GITHUB_CALLBACK_URL || "",
  },
  groqApiKey: process.env.GROQ_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
};

import mongoose from "mongoose";
import { config } from "./keys.js";

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

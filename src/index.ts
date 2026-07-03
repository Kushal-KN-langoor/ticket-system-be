import "dotenv/config";
import express from "express";
import multer from "multer";
import routes from "./routes";
import { supabase } from "./lib/supabase";


const app = express();
const frontendUrl = process.env.FRONTEND_URL;

app.use((req, res, next) => {
  if (frontendUrl) {
    res.header("Access-Control-Allow-Origin", frontendUrl);
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.use("/api", routes);


const PORT = process.env.PORT || 3000;
app.get("/test-supabase", async (req, res) => {
  try {
    console.log("🔍 Testing Supabase connection...");
    console.log("URL:", process.env.SUPABASE_URL);
    console.log("Bucket:", process.env.SUPABASE_BUCKET);

    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .list();

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({
        message: "Supabase connection failed",
        error: error.message,
        details: error
      });
    }

    console.log("✅ Supabase connected!");
    return res.json({
      message: "Supabase connected!",
      files: data
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({
      message: "Error connecting to Supabase",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
// 404 handler - must come after all routes
app.use((req, res) => {
  res.status(404).json({ status: "404", message: `No route for ${req.method} ${req.originalUrl}` });
});

// Global error handler - must be defined LAST, with 4 args
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("❌ Unhandled error:", err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: "400",
      message: "File upload error",
      detail: err.message,
    });
  }

  if (err?.message?.includes("Unsupported file type")) {
    return res.status(400).json({
      status: "400",
      message: err.message,
    });
  }

  return res.status(500).json({
    status: "500",
    message: "Internal server error",
    detail: err?.message ?? "Unknown error",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
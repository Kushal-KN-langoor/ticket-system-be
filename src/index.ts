import express from "express";
import routes from "./routes";

const app = express();

app.use(express.json());

// Register all routes
app.use("/api", routes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
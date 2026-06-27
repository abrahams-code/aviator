const mongoose = require("mongoose");
require("dotenv").config();

async function testConnection() {
  try {
    console.log("Connecting to MongoDB Atlas...");

    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ Successfully connected to MongoDB Atlas!");
    console.log("Database:", mongoose.connection.name);
    console.log("Host:", mongoose.connection.host);

    await mongoose.disconnect();
    console.log("✅ Connection closed.");
  } catch (error) {
    console.error("❌ Connection failed!");
    console.error("Error:", error.message);
  }
}

testConnection();
const dns = require("dns");
dns.setServers(["8.8.8.8"]);
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const Sensor = require("./models/Sensor");
const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
    res.send("AquaGuard Backend is Running!");
});

// POST - Save sensor data
app.post("/api/sensors", async (req, res) => {
    try {
        console.log("POST /api/sensors received");
        console.log(req.body);

        const sensor = new Sensor(req.body);
        const savedSensor = await sensor.save();

        res.status(201).json(savedSensor);
    } catch (error) {
        console.log("Sensor Save Error:", error.message);

        res.status(500).json({
            message: "Failed to save sensor data",
            error: error.message
        });
    }
});

// GET - Read sensor data
app.get("/api/sensors", async (req, res) => {
    try {
        const sensors = await Sensor.find().sort({ timestamp: -1 });

        res.json(sensors);
    } catch (error) {
        console.log("Sensor Fetch Error:", error.message);

        res.status(500).json({
            message: "Failed to get sensor data",
            error: error.message
        });
    }
});

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected Successfully!");

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
});
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:", error.message);
    });
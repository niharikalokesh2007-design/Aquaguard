const mongoose = require("mongoose");

const sensorSchema = new mongoose.Schema({
    ph: {
        type: Number,
        required: true
    },
    turbidity: {
        type: Number,
        required: true
    },
    chlorine: {
        type: Number,
        required: true
    },
    temperature: {
        type: Number,
        required: true
    },
    tds: {
        type: Number,
        required: true
    },
    flowRate: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Sensor", sensorSchema);
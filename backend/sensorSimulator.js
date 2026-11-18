const axios = require("axios");

// Starting values
let currentData = {
    ph: 7.2,
    turbidity: 2.5,
    chlorine: 1.5,
    temperature: 27,
    tds: 350,
    flowRate: 120
};

// Keep values within realistic limits
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Generate realistic changing sensor data
function generateSensorData() {

    // Small natural changes
    currentData.ph += (Math.random() - 0.5) * 0.2;
    currentData.turbidity += (Math.random() - 0.5) * 0.8;
    currentData.chlorine += (Math.random() - 0.5) * 0.2;
    currentData.temperature += (Math.random() - 0.5) * 0.6;
    currentData.tds += (Math.random() - 0.5) * 15;
    currentData.flowRate += (Math.random() - 0.5) * 8;

    // Occasionally create an abnormal condition
    const abnormalEvent = Math.random() < 0.15;

    if (abnormalEvent) {

        const eventType = Math.floor(Math.random() * 4);

        switch (eventType) {

            case 0:
                // High turbidity
                currentData.turbidity += 3;
                break;

            case 1:
                // Low chlorine
                currentData.chlorine -= 0.8;
                break;

            case 2:
                // Abnormal pH
                currentData.ph += Math.random() > 0.5 ? 1.5 : -1.2;
                break;

            case 3:
                // Abnormal flow
                currentData.flowRate += Math.random() > 0.5 ? 45 : -45;
                break;
        }

        console.log("⚠️ Abnormal sensor condition generated!");
    }

    // Keep values within sensible ranges
    currentData.ph = clamp(currentData.ph, 5.5, 9.5);
    currentData.turbidity = clamp(currentData.turbidity, 0.5, 10);
    currentData.chlorine = clamp(currentData.chlorine, 0.1, 3);
    currentData.temperature = clamp(currentData.temperature, 20, 40);
    currentData.tds = clamp(currentData.tds, 200, 600);
    currentData.flowRate = clamp(currentData.flowRate, 60, 180);

    return {
        ph: Number(currentData.ph.toFixed(1)),
        turbidity: Number(currentData.turbidity.toFixed(1)),
        chlorine: Number(currentData.chlorine.toFixed(1)),
        temperature: Number(currentData.temperature.toFixed(1)),
        tds: Math.round(currentData.tds),
        flowRate: Math.round(currentData.flowRate)
    };
}

// Send sensor data to backend
async function sendSensorData() {

    const data = generateSensorData();

    try {

        const response = await axios.post(
            "http://localhost:5000/api/sensors",
            data
        );

        console.log("✅ Sensor data sent:", response.data);

    } catch (error) {

        console.log(
            "❌ Error sending sensor data:",
            error.message
        );
    }
}

// Send data every 5 seconds
setInterval(sendSensorData, 5000);

// Send first reading immediately
sendSensorData();
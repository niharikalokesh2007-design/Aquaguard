const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

async function createUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected for user setup");

        const users = [
            {
                username: "admin",
                password: "aquaguard123",
                role: "admin",
                name: "System Admin"
            },
            {
                username: "operator",
                password: "operator123",
                role: "operator",
                name: "Plant Operator"
            },
            {
                username: "agriculture",
                password: "agriculture123",
                role: "agriculture",
                name: "Agriculture Manager"
            }
        ];

        for (const userData of users) {
            const existingUser = await User.findOne({
                username: userData.username
            });

            if (existingUser) {
                console.log(`User already exists: ${userData.username}`);
                continue;
            }

            const hashedPassword = await bcrypt.hash(
                userData.password,
                10
            );

            const user = new User({
                username: userData.username,
                password: hashedPassword,
                role: userData.role,
                name: userData.name,
                active: true
            });

            await user.save();

            console.log(`Created user: ${userData.username}`);
        }

        console.log("User setup completed!");
        process.exit(0);

    } catch (error) {
        console.error("User setup error:", error.message);
        process.exit(1);
    }
}

createUsers();
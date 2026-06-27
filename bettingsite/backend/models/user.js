const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
{
    username: {
        type: String,
        required: true,
        unique: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    balance: {
        type: Number,
        default: 1000
    },

    xp: {
    type: Number,
    default: 0
},

level: {
    type: Number,
    default: 1
},
},
{
    timestamps: true
}
);

module.exports = mongoose.model("user", userSchema);

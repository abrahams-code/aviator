const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema({
    crashPoint: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
});
 
module.exports = mongoose.model("Round", roundSchema);
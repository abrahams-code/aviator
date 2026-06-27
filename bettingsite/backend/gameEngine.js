const Round = require("./models/Round");

let multiplier = 1;

async function startRound(io) {

    multiplier = 1;
 
    io.emit("roundStart");

    const interval = setInterval(async () => {

        multiplier += 0.01; 

        io.emit("multiplier", {
            multiplier: multiplier.toFixed(2)
        });

        if (Math.random() < 0.01) {

            try {

                await Round.create({
                    crashPoint: Number(
                        multiplier.toFixed(2)
                    )
                });

            } catch (err) {

                console.error(err);

            }

            io.emit("crash", {
                at: multiplier.toFixed(2)
            });

            clearInterval(interval);

            startCountdown(io);

        }

    }, 100);
}

function startCountdown(io) {

    let seconds = 5;

    io.emit("countdown", {
        seconds
    });

    const countdownInterval =
        setInterval(() => {

            seconds--;

            io.emit("countdown", {
                seconds
            });

            if (seconds <= 0) {

                clearInterval(
                    countdownInterval
                );

                startRound(io);

            }

        }, 1000);

}

module.exports = {
    startRound
};
const express = require("express");
const app = express();
const cors = require("cors");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/users", require("./routers/userRoutes"));
app.use("/api/maps", require("./routers/mapRoutes"));
app.use("/api/games", require("./routers/gameRoutes"));


app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
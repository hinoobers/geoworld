const express = require("express");
const router = express.Router();

router.post("/create-map", (req, res) => {
    // map_name, description, map_positions: [{ lat, lng, rotation }]
});

router.get("/get-maps", (req, res) => {
    // return list of maps with map_id, map_name, description, map_positions: [{ lat, lng, rotation }]
});

module.exports = router;
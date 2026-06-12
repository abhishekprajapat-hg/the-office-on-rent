const express = require("express");
const router = express.Router();

const publicInventoryController = require("../controllers/publicInventory.controller");

// Public endpoint — no authentication required.
// Clients access inventory via share token.
router.get("/inventory/:shareToken", publicInventoryController.getSharedInventory);

module.exports = router;

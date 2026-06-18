const express = require("express");
const router = express.Router();
const taskController = require("../controllers/task.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

// All routes are protected by JWT authentication
router.use(authMiddleware.protect);

router.get("/", taskController.getTasks);
router.get("/stats", taskController.getTaskStats);
router.get("/:taskId", taskController.getTaskById);

router.post("/", writeLimiter, taskController.createTask);
router.patch("/:taskId", writeLimiter, taskController.updateTask);
router.delete("/:taskId", writeLimiter, taskController.deleteTask);

module.exports = router;

module.exports = {
  apps: [
    {
      name: "the-office-on-rent-backend",
      cwd: "/var/www/the-office-on-rent/backend",
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5100,
      },
    },
  ],
};

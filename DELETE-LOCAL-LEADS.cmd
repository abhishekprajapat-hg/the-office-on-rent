@echo off
rem Deletes ALL leads (and their own history) from the LOCAL database only.
rem Refuses to run against anything that is not the local Mongo. Shows the counts
rem and asks you to type DELETE first. A backup is written to backend\.local-db-backups.
rem The result is also saved to delete-leads.log.
cd /d "%~dp0backend"
node src\seeder\deleteLocalLeads.cjs
echo.
pause


@echo off
rem Stops the Agent Monitor container. It stays stopped (also after a reboot) until start.cmd.
docker stop agent-monitor

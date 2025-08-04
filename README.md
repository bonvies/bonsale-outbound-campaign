# bonsale-outbound-campaign

**Version: v0.1.6**

## Environment Variables

The application uses the following environment variables. These should be defined in a `.env` file located in the root directory of the project.

| Variable Name             | Default Value                                 | Description                                  |
|---------------------------|-----------------------------------------------|----------------------------------------------|
| `HTTP_HOST_3CX`           | `https://<YOUR 3CX DOMAIN>`                   | The host URL for the 3CX HTTP API.           |
| `WS_HOST_3CX`             | `wss://<YOUR 3CX DOMAIN>`                     | The host URL for the 3CX WebSocket API.      |
| `CALL_GAP_TIME`           | `0.8`                                           | The time gap (in seconds) between calls.     |
| `HTTP_PORT`               | `3020`                                        | The port for the HTTP server.                |
| `BONSALE_HOST`            | `https://<YOUR BONSALE_HOST>/service`         | The host URL for the Bonsale API.            |
| `BONSALE_X_API_KEY`       | `YOUR X_API_KEY`                              | The API key for the Bonsale API.             |
| `BONSALE_X_API_SECRET`    | `YOUR X_API_SECRET`                           | The API secret for the Bonsale API.          |
| `BONSALE_CONFIG_NAME`     | `your_bonsale_config_name`                 | (Optional) The config name for Bonsale project outbound history. |
| `ADMIN_3CX_CLIENT_ID`     | `your_3CX_client_id`                                       | The client ID for 3CX admin API.             |
| `ADMIN_3CX_CLIENT_SECRET` | `your_admin_client_secret`                    | The client secret for 3CX admin API.         |
| `ADMIN_3CX_GRANT_TYPE`    | `client_credentials`                          | The grant type for 3CX admin API.            |
| `IS_PROJECT_ERROR_AUTO_RESTART` | `true` or `false`                   | (Optional) Enable automatic restart for projects when errors occur. Default: `false` |
| `DISCORD_ERROR_ALERT_GAP_TIME` | `your_discord_error_alert_gap_time` | (Optional) The interval (in seconds) for monitoring errors and sending Discord alerts. |
| `DISCORD_BOT_TOKEN` | `your_discord_bot_token`| (Optional) Discord bot token for sending error notifications. |
| `DISCORD_CHANNEL_ID` | `your_discord_channel_id` | (Optional) Discord channel ID to receive error notifications. |

### Example `.env` File

Below is an example of how the `.env` file should look:

```
HTTP_HOST_3CX=https://<YOUR 3CX DOMAIN>
WS_HOST_3CX=wss://<YOUR 3CX DOMAIN>
CALL_GAP_TIME=3
HTTP_PORT=3020

BONSALE_HOST=https://<YOUR BONSALE_HOST>/service
BONSALE_X_API_KEY=YOUR X_API_KEY
BONSALE_X_API_SECRET=YOUR X_API_SECRET
BONSALE_CONFIG_NAME=3CX-projectOutbound-history

ADMIN_3CX_CLIENT_ID=your_3CX_client_id
ADMIN_3CX_CLIENT_SECRET=your_admin_client_secret
ADMIN_3CX_GRANT_TYPE=client_credentials

# Project error auto restart
IS_PROJECT_ERROR_AUTO_RESTART=true  # Optional: Enable automatic restart for projects when errors occur

# Discord error alert settings
DISCORD_ERROR_ALERT_GAP_TIME=300  # Optional: Enable Discord error alert, unit is seconds
DISCORD_BOT_TOKEN=your_discord_bot_token      # Optional: Discord bot token
DISCORD_CHANNEL_ID=your_discord_channel_id    # Optional: Discord channel ID
```
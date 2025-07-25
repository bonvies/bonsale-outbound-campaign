# bonsale-outbound-campaign

**Version: v0.1.4**

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
| `ADMIN_3CX_CLIENT_ID`     | `your_3CX_client_id`                                       | The client ID for 3CX admin API.             |
| `ADMIN_3CX_CLIENT_SECRET` | `your_admin_client_secret`                    | The client secret for 3CX admin API.         |
| `ADMIN_3CX_GRANT_TYPE`    | `client_credentials`                          | The grant type for 3CX admin API.            |

### Example `.env` File

Below is an example of how the `.env` file should look:

```env
HTTP_HOST_3CX=https://<YOUR 3CX DOMAIN>
WS_HOST_3CX=wss://<YOUR 3CX DOMAIN>
CALL_GAP_TIME=3
HTTP_PORT=3020

BONSALE_HOST=https://<YOUR BONSALE_HOST>/service
BONSALE_X_API_KEY=YOUR X_API_KEY
BONSALE_X_API_SECRET=YOUR X_API_SECRET

ADMIN_3CX_CLIENT_ID=your_3CX_client_id
ADMIN_3CX_CLIENT_SECRET=your_admin_client_secret
ADMIN_3CX_GRANT_TYPE=client_credentials
```
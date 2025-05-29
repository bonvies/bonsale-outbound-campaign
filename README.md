# bonsale-outbound-campaign

## Environment Variables

The application uses the following environment variables. These should be defined in a `.env` file located in the root directory of the project.

| Variable Name           | Default Value                                 | Description                                  |
|------------------------|-----------------------------------------------|----------------------------------------------|
| `HTTP_HOST_3CX`        | `https://<YOUR 3CX DOMAIN>`                   | The host URL for the 3CX HTTP API.           |
| `WS_HOST_3CX`          | `wss://<YOUR 3CX DOMAIN>`                     | The host URL for the 3CX WebSocket API.      |
| `CALL_GAP_TIME`        | `3`                                           | The time gap (in seconds) between calls.     |
| `HTTP_PORT`            | `3020`                                        | The port for the HTTP server.                |
| `NGROK_AUTHTOKEN`      | `YOUR NGROK_AUTHTOKEN`                        | The authtoken for ngrok tunnel.              |
| `BONSALE_HOST`         | `https://<YOUR BONSALE_HOST>/service`         | The host URL for the Bonsale API.            |
| `BONSALE_X_API_KEY`    | `YOUR X_API_KEY`                              | The API key for the Bonsale API.             |
| `BONSALE_X_API_SECRET` | `YOUR X_API_SECRET`                           | The API secret for the Bonsale API.          |

### Example `.env` File

Below is an example of how the `.env` file should look:

```env
HTTP_HOST_3CX=https://<YOUR 3CX DOMAIN>
WS_HOST_3CX=wss://<YOUR 3CX DOMAIN>
CALL_GAP_TIME=3
HTTP_PORT=3020
WS_PORT_OUTBOUND_CAMPAIGM=3021
WS_PORT_PROJECT_OUTBOUND=3022
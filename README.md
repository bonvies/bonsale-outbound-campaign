# bonsale-outbound-campaign

## Environment Variables

The application uses the following environment variables. These should be defined in a `.env` file located in the root directory of the project.

| Variable Name                  | Default Value                                      | Description                                  |
|--------------------------------|---------------------------------------------------|-----------------------------------------------|
| `HTTP_HOST_3CX`                | `https://bonuc.3cx.com.tw`                        | The host URL for the 3CX HTTP API.            |
| `WS_HOST_3CX`                  | `wss://bonuc.3cx.com.tw`                          | The host URL for the 3CX WebSocket API.       |
| `CALL_GAP_TIME`                | `3`                                               | The time gap (in seconds) between calls.      |
| `HTTP_PORT`                    | `3020`                                            | The port for the HTTP server.                 |
| `WS_PORT_OUTBOUND_CAMPAIGM`    | `3021`                                            | The port for the WebSocket server.            |
| `WS_PORT_OUTBOUND_CAMPAIGM_V2` | `3022`                                            | The port for the second WebSocket server.     |
| `BONSALE_HOST`                 | `https://telesale-drvet-beta-api-nygimqgkxq-de.a.run.app/service` | The host URL for the Bonsale API. |
| `BONSALE_X_API_KEY`            | ``                                | The API key for the Bonsale API.              |
| `BONSALE_X_API_SECRET`         | ``                                | The API secret for the Bonsale API.           |

### Example `.env` File

Below is an example of how the `.env` file should look:

```env
HTTP_HOST_3CX=https://bonuc.3cx.com.tw
WS_HOST_3CX=wss://bonuc.3cx.com.tw
CALL_GAP_TIME=3
HTTP_PORT=3020
WS_PORT_OUTBOUND_CAMPAIGM=3021
WS_PORT_OUTBOUND_CAMPAIGM_V2=3022
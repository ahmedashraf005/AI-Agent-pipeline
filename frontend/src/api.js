const configuredGatewayUrl = import.meta.env?.VITE_GATEWAY_URL ?? 'http://localhost:5000'

export const gatewayBaseUrl = configuredGatewayUrl.replace(/\/$/, '')

export function gatewayUrl(path) {
  return `${gatewayBaseUrl}${path}`
}

export async function responseErrorMessage(response) {
  const body = await response.text()

  if (body) {
    try {
      const error = JSON.parse(body)
      if (error.message) return error.message
    } catch {
      // Fall back to the HTTP status when the response is not JSON.
    }
  }

  return response.statusText || `Request failed with status ${response.status}`
}

export function requestErrorMessage(error) {
  if (error instanceof TypeError) {
    return `Cannot reach the Gateway API at ${gatewayBaseUrl}. Start the Gateway API, then try again.`
  }

  return error instanceof Error ? error.message : 'Request failed unexpectedly.'
}
